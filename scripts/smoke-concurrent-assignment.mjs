const BASE_URL = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";

class SessionClient {
  constructor(label) {
    this.label = label;
    this.cookies = new Map();
    this.results = [];
  }

  _storeCookiesFromResponse(response) {
    const rawSetCookies = typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [];

    const fallback = response.headers.get("set-cookie");
    const setCookies = rawSetCookies.length > 0
      ? rawSetCookies
      : fallback
        ? [fallback]
        : [];

    for (const cookieText of setCookies) {
      const [pair] = cookieText.split(";");
      if (!pair || !pair.includes("=")) {
        continue;
      }

      const idx = pair.indexOf("=");
      const name = pair.slice(0, idx).trim();
      const value = pair.slice(idx + 1).trim();
      this.cookies.set(name, value);
    }
  }

  _cookieHeader() {
    if (this.cookies.size === 0) {
      return undefined;
    }

    return Array.from(this.cookies.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }

  async request({ name, path, method = "GET", headers = {}, body, expectedStatus }) {
    const finalHeaders = { ...headers };
    const cookieHeader = this._cookieHeader();
    if (cookieHeader) {
      finalHeaders.cookie = cookieHeader;
    }

    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: finalHeaders,
      body,
      redirect: "manual",
    });

    this._storeCookiesFromResponse(response);

    const expectedList = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
    const pass = expectedList.includes(response.status);

    let payload = null;
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      payload = await response.json().catch(() => null);
    } else {
      payload = await response.text().catch(() => null);
    }

    this.results.push({
      client: this.label,
      name,
      method,
      path,
      status: response.status,
      expected: expectedList.join("/"),
      pass,
    });

    return { response, payload, pass };
  }

  async login(email, password) {
    const csrf = await this.request({
      name: `CSRF ${email}`,
      path: "/api/auth/csrf",
      expectedStatus: 200,
    });

    if (!csrf.payload?.csrfToken) {
      throw new Error(`[${this.label}] Unable to fetch CSRF token.`);
    }

    const form = new URLSearchParams({
      csrfToken: csrf.payload.csrfToken,
      email,
      password,
      callbackUrl: `${BASE_URL}/schedule`,
    });

    await this.request({
      name: `Login ${email}`,
      path: "/api/auth/callback/credentials",
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
      expectedStatus: [200, 302],
    });

    const session = await this.request({
      name: `Session ${email}`,
      path: "/api/auth/session",
      expectedStatus: 200,
    });

    if (session.payload?.user?.email !== email) {
      throw new Error(`[${this.label}] Login session mismatch for ${email}.`);
    }
  }
}

function nextMondayAtUtc(hour, additionalDays = 0) {
  const date = new Date();
  const day = date.getUTCDay();
  const daysUntilNextMonday = ((8 - day) % 7) || 7;
  date.setUTCDate(date.getUTCDate() + daysUntilNextMonday + additionalDays);
  date.setUTCHours(hour, 0, 0, 0);
  return date;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function getDayOfWeekInTimezone(date, timeZone) {
  const dayText = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone,
  }).format(date);

  const lookup = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return lookup[dayText] ?? date.getUTCDay();
}

async function run() {
  const managerA = new SessionClient("manager-john");
  const managerB = new SessionClient("admin-rina");

  await managerA.login("manager.john@coastaleats.com", "password123");
  await managerB.login("admin.rina@coastaleats.com", "password123");

  const options = await managerA.request({
    name: "Shift options",
    path: "/api/shifts/options",
    expectedStatus: 200,
  });

  const locations = options.payload?.data?.locations ?? [];
  const skills = options.payload?.data?.skills ?? [];
  const staff = options.payload?.data?.staff ?? [];

  const downtown = locations.find((entry) => entry.name?.toLowerCase().includes("downtown")) ?? locations[0];
  assert(downtown?.id, "No manageable location found for concurrency smoke.");

  const eligibleAssignee = staff.find((entry) => {
    const hasLocationCert = entry.certifications?.some((certification) => certification.locationId === downtown.id);
    const hasAnySkill = Array.isArray(entry.skills) && entry.skills.length > 0;
    return hasLocationCert && hasAnySkill;
  });

  assert(eligibleAssignee?.id, "No eligible staff member found for concurrency smoke.");
  assert(eligibleAssignee?.email, "Eligible staff member is missing email for login.");

  const requiredSkillId = eligibleAssignee.skills[0]?.skillId;
  const requiredSkill = skills.find((entry) => entry.id === requiredSkillId) ?? skills[0];
  assert(requiredSkill?.id, "No assignable skill found for concurrency smoke.");

  const staffAssignee = new SessionClient(`staff-${eligibleAssignee.email.split("@")[0]}`);
  await staffAssignee.login(eligibleAssignee.email, "password123");

  const startDate = nextMondayAtUtc(13, 35);
  const endDate = new Date(startDate);
  endDate.setUTCHours(endDate.getUTCHours() + 8);

  const availabilityDayOfWeek = getDayOfWeekInTimezone(startDate, downtown.timezone);

  const availabilityCreate = await staffAssignee.request({
    name: "Create temporary availability",
    path: "/api/availability",
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "RECURRING",
      dayOfWeek: availabilityDayOfWeek,
      startMinute: 0,
      endMinute: 1439,
      locationId: downtown.id,
    }),
    expectedStatus: [201, 409],
  });

  const availabilityId = availabilityCreate.payload?.data?.id;

  const createdShift = await managerA.request({
    name: "Create concurrency shift",
    path: "/api/shifts",
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      locationId: downtown.id,
      requiredSkillId: requiredSkill.id,
      startDateTime: startDate.toISOString(),
      endDateTime: endDate.toISOString(),
      headcount: 2,
    }),
    expectedStatus: 201,
  });

  const shiftId = createdShift.payload?.data?.id;
  assert(shiftId, "Shift creation failed for concurrency smoke.");

  const [assignA, assignB] = await Promise.all([
    managerA.request({
      name: "Concurrent assignment A",
      path: `/api/shifts/${shiftId}/assignments`,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: eligibleAssignee.id }),
      expectedStatus: [201, 409],
    }),
    managerB.request({
      name: "Concurrent assignment B",
      path: `/api/shifts/${shiftId}/assignments`,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: eligibleAssignee.id }),
      expectedStatus: [201, 409],
    }),
  ]);

  const statuses = [assignA.response.status, assignB.response.status].sort((a, b) => a - b);
  assert(
    statuses[0] === 201 && statuses[1] === 409,
    `Expected one success and one conflict for concurrent assignment, got ${statuses.join(",")}`
  );

  await managerA.request({
    name: "Cleanup concurrency shift",
    path: `/api/shifts/${shiftId}`,
    method: "DELETE",
    expectedStatus: 200,
  });

  if (availabilityId) {
    await staffAssignee.request({
      name: "Cleanup temporary availability",
      path: `/api/availability/${availabilityId}`,
      method: "DELETE",
      expectedStatus: 200,
    });
  }

  const results = [...managerA.results, ...managerB.results, ...staffAssignee.results];

  console.log("\n=== Concurrent Assignment Smoke Results ===");
  for (const result of results) {
    const marker = result.pass ? "PASS" : "FAIL";
    console.log(
      `${marker.padEnd(5)} [${result.client}] ${result.method} ${result.path} -> ${result.status} (expected ${result.expected}) :: ${result.name}`
    );
  }

  console.log("\nSummary: concurrent first-wins conflict behavior validated.");
}

run().catch((error) => {
  console.error("Concurrent smoke run failed:", error);
  process.exit(1);
});
