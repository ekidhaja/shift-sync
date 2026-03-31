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

      if (!name) {
        continue;
      }

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

  async request({
    name,
    path,
    method = "GET",
    headers = {},
    body,
    expectedStatus,
    retries = 0,
  }) {
    let lastRun = null;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
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

      lastRun = { response, payload, pass, expectedList };

      const shouldRetry = !pass && response.status === 503 && attempt < retries;
      if (!shouldRetry) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }

    this.results.push({
      client: this.label,
      name,
      path,
      method,
      status: lastRun.response.status,
      expected: lastRun.expectedList.join("/"),
      pass: lastRun.pass,
    });

    return { response: lastRun.response, payload: lastRun.payload, pass: lastRun.pass };
  }

  async login(email, password) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const csrf = await this.request({
        name: `Get CSRF token (attempt ${attempt})`,
        path: "/api/auth/csrf",
        expectedStatus: 200,
        retries: 1,
      });

      if (!csrf.pass || !csrf.payload?.csrfToken) {
        continue;
      }

      const form = new URLSearchParams({
        csrfToken: csrf.payload.csrfToken,
        email,
        password,
        callbackUrl: `${BASE_URL}/profile`,
      });

      const login = await this.request({
        name: `Login ${email} (attempt ${attempt})`,
        path: "/api/auth/callback/credentials",
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: form.toString(),
        expectedStatus: [200, 302],
        retries: 1,
      });

      if (!login.pass) {
        continue;
      }

      const session = await this.request({
        name: `Get session (attempt ${attempt})`,
        path: "/api/auth/session",
        expectedStatus: 200,
        retries: 1,
      });

      if (session.payload?.user?.email === email) {
        return;
      }
    }

    throw new Error(`[${this.label}] Login failed for ${email} after retries.`);
  }
}

function isoAfterDays(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function isoBeforeDays(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString();
}

function weekStartIso(dateInput) {
  const date = new Date(dateInput);
  date.setUTCHours(0, 0, 0, 0);
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diff);
  return date.toISOString();
}

function nextMondayAtUtc(hour, additionalDays = 0) {
  const date = new Date();
  const day = date.getUTCDay();
  const daysUntilNextMonday = ((8 - day) % 7) || 7;
  date.setUTCDate(date.getUTCDate() + daysUntilNextMonday + additionalDays);
  date.setUTCHours(hour, 0, 0, 0);
  return date;
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

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function run() {
  const unauth = new SessionClient("unauth");
  const admin = new SessionClient("admin");
  const manager = new SessionClient("manager");
  const staff = new SessionClient("staff");
  const staffSky = new SessionClient("staff-sky");
  const staffTina = new SessionClient("staff-tina");
  const staffAria = new SessionClient("staff-aria");
  const staffNoah = new SessionClient("staff-noah");
  const staffLeah = new SessionClient("staff-leah");

  await unauth.request({
    name: "Health",
    path: "/api/health",
    expectedStatus: 200,
  });

  await unauth.request({
    name: "Profile blocked unauth",
    path: "/api/profile",
    expectedStatus: 401,
  });

  await admin.login("admin.paul@coastaleats.com", "password123");
  await manager.login("manager.john@coastaleats.com", "password123");
  await staff.login("staff.sam@coastaleats.com", "password123");
  await staffSky.login("staff.sky@coastaleats.com", "password123");
  await staffTina.login("staff.tina@coastaleats.com", "password123");
  await staffAria.login("staff.aria@coastaleats.com", "password123");
  await staffNoah.login("staff.noah@coastaleats.com", "password123");
  await staffLeah.login("staff.leah@coastaleats.com", "password123");

  const adminOptions = await admin.request({
    name: "Admin shift options",
    path: "/api/shifts/options",
    expectedStatus: 200,
  });

  const allLocations = adminOptions.payload?.data?.locations ?? [];
  const allStaff = adminOptions.payload?.data?.staff ?? [];

  const staffScopeChecks = [
    { client: staff, email: "staff.sam@coastaleats.com" },
    { client: staffSky, email: "staff.sky@coastaleats.com" },
    { client: staffTina, email: "staff.tina@coastaleats.com" },
    { client: staffAria, email: "staff.aria@coastaleats.com" },
    { client: staffNoah, email: "staff.noah@coastaleats.com" },
    { client: staffLeah, email: "staff.leah@coastaleats.com" },
  ];

  for (const check of staffScopeChecks) {
    const staffOption = allStaff.find((entry) => entry?.email === check.email);
    const certifiedLocationIds = new Set(
      (staffOption?.certifications ?? [])
        .map((entry) => entry?.locationId)
        .filter((entry) => typeof entry === "string")
    );

    const uncertifiedLocation = allLocations.find((location) => !certifiedLocationIds.has(location.id));
    if (!uncertifiedLocation) {
      continue;
    }

    await check.client.request({
      name: `Staff uncertified availability blocked (${check.email})`,
      path: "/api/availability",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "RECURRING",
        dayOfWeek: 2,
        startMinute: 600,
        endMinute: 960,
        locationId: uncertifiedLocation.id,
      }),
      expectedStatus: 403,
    });
  }

  await admin.request({ name: "Profile read", path: "/api/profile", expectedStatus: 200 });
  await admin.request({
    name: "Profile patch",
    path: "/api/profile",
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Paul Admin" }),
    expectedStatus: 200,
  });

  await admin.request({ name: "Notifications read", path: "/api/notifications", expectedStatus: 200 });
  await admin.request({
    name: "Notifications mark all",
    path: "/api/notifications",
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ markAll: true }),
    expectedStatus: 200,
  });
  await admin.request({ name: "Notification prefs read", path: "/api/notifications/preferences", expectedStatus: 200 });

  await admin.request({ name: "Fairness summary", path: "/api/fairness/summary", expectedStatus: 200 });
  await admin.request({ name: "On duty", path: "/api/on-duty", expectedStatus: 200 });
  await admin.request({ name: "Audit export all", path: "/api/audit/export", expectedStatus: 200 });
  await admin.request({
    name: "Audit export date range",
    path: `/api/audit/export?from=${encodeURIComponent(isoBeforeDays(30))}&to=${encodeURIComponent(new Date().toISOString())}`,
    expectedStatus: 200,
  });
  await admin.request({
    name: "Audit export invalid range",
    path: `/api/audit/export?from=${encodeURIComponent(new Date().toISOString())}&to=${encodeURIComponent(isoBeforeDays(30))}`,
    expectedStatus: 400,
  });

  const managerOptions = await manager.request({
    name: "Shift options",
    path: "/api/shifts/options",
    expectedStatus: 200,
  });

  const managerLocations = managerOptions.payload?.data?.locations ?? [];
  const managerSkills = managerOptions.payload?.data?.skills ?? [];
  const managerStaff = managerOptions.payload?.data?.staff ?? [];

  const staffSamOption = managerStaff.find((entry) => entry?.email === "staff.sam@coastaleats.com");
  const staffSkyOption = managerStaff.find((entry) => entry?.email === "staff.sky@coastaleats.com");

  const locationId = managerLocations.find((location) =>
    staffSamOption?.certifications?.some((certification) => certification.locationId === location.id)
    && staffSkyOption?.certifications?.some((certification) => certification.locationId === location.id)
  )?.id ?? managerLocations[0]?.id;

  const serverSkillId = managerSkills.find((entry) => entry?.name === "server")?.id;
  const sharedSkillIds = new Set(
    (staffSamOption?.skills ?? [])
      .map((entry) => entry?.skillId)
      .filter((value) => typeof value === "string" && (staffSkyOption?.skills ?? []).some((s) => s.skillId === value))
  );
  const requiredSkillId = serverSkillId
    ?? managerSkills.find((entry) => sharedSkillIds.has(entry.id))?.id
    ?? managerSkills[0]?.id;

  const assignUserId = managerStaff[0]?.id;

  if (locationId && requiredSkillId) {
    const startDateTime = isoAfterDays(10);
    const endDateTime = isoAfterDays(10);
    const endDate = new Date(endDateTime);
    endDate.setUTCHours(endDate.getUTCHours() + 8);

    const createdShift = await manager.request({
      name: "Create shift",
      path: "/api/shifts",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        locationId,
        requiredSkillId,
        startDateTime,
        endDateTime: endDate.toISOString(),
        headcount: 1,
      }),
      expectedStatus: 201,
    });

    const shiftId = createdShift.payload?.data?.id;

    if (shiftId) {
      await manager.request({
        name: "Shift detail patch",
        path: `/api/shifts/${shiftId}`,
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ headcount: 2 }),
        expectedStatus: 200,
      });

      await manager.request({
        name: "Shift audit history",
        path: `/api/audit/shift/${shiftId}`,
        expectedStatus: 200,
      });

      if (assignUserId) {
        const assign = await manager.request({
          name: "Shift assignment create",
          path: `/api/shifts/${shiftId}/assignments`,
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: assignUserId }),
          expectedStatus: [201, 409],
        });

        const assignmentId = assign.payload?.data?.id;
        if (assignmentId) {
          await manager.request({
            name: "Shift assignment delete",
            path: `/api/shifts/${shiftId}/assignments/${assignmentId}`,
            method: "DELETE",
            expectedStatus: 200,
          });
        }
      }

      await manager.request({
        name: "Shift delete",
        path: `/api/shifts/${shiftId}`,
        method: "DELETE",
        expectedStatus: 200,
      });
    }

    if (assignUserId) {
      const overlapStart = isoAfterDays(14);
      const overlapEnd = new Date(overlapStart);
      overlapEnd.setUTCHours(overlapEnd.getUTCHours() + 8);

      const createConflictShift = async (name) => manager.request({
        name,
        path: "/api/shifts",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationId,
          requiredSkillId,
          startDateTime: overlapStart,
          endDateTime: overlapEnd.toISOString(),
          headcount: 2,
        }),
        expectedStatus: 201,
      });

      const firstShift = await createConflictShift("Conflict shift A create");
      const secondShift = await createConflictShift("Conflict shift B create");

      const firstShiftId = firstShift.payload?.data?.id;
      const secondShiftId = secondShift.payload?.data?.id;

      if (firstShiftId && secondShiftId) {
        await manager.request({
          name: "Conflict assign first shift",
          path: `/api/shifts/${firstShiftId}/assignments`,
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: assignUserId }),
          expectedStatus: [201, 409],
        });

        await manager.request({
          name: "Conflict assign overlapping second shift",
          path: `/api/shifts/${secondShiftId}/assignments`,
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: assignUserId }),
          expectedStatus: 409,
        });

        await manager.request({
          name: "Conflict shift A delete",
          path: `/api/shifts/${firstShiftId}`,
          method: "DELETE",
          expectedStatus: 200,
        });

        await manager.request({
          name: "Conflict shift B delete",
          path: `/api/shifts/${secondShiftId}`,
          method: "DELETE",
          expectedStatus: 200,
        });
      }
    }

    const weekStartDate = new Date(startDateTime);
    weekStartDate.setUTCHours(0, 0, 0, 0);
    const dow = weekStartDate.getUTCDay();
    const diff = dow === 0 ? -6 : 1 - dow;
    weekStartDate.setUTCDate(weekStartDate.getUTCDate() + diff);

    await manager.request({
      name: "Schedule publish",
      path: "/api/shifts/publish",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        locationId,
        weekStartDate: weekStartDate.toISOString(),
        publish: true,
      }),
      expectedStatus: [200, 409],
    });

    await manager.request({
      name: "Audit export scoped",
      path: `/api/audit/export?locationId=${encodeURIComponent(locationId)}`,
      expectedStatus: 200,
    });

    await manager.request({
      name: "Audit export scoped date range",
      path: `/api/audit/export?locationId=${encodeURIComponent(locationId)}&from=${encodeURIComponent(isoBeforeDays(30))}&to=${encodeURIComponent(new Date().toISOString())}`,
      expectedStatus: 200,
    });

    await manager.request({
      name: "Overtime dashboard",
      path: `/api/compliance/overtime?locationId=${encodeURIComponent(locationId)}`,
      expectedStatus: 200,
    });

    await manager.request({
      name: "Fairness scoped",
      path: `/api/fairness/summary?locationId=${encodeURIComponent(locationId)}`,
      expectedStatus: 200,
    });
  }

  await manager.request({
    name: "Managed availability",
    path: "/api/availability/managed",
    expectedStatus: 200,
  });

  await manager.request({
    name: "Manager audit export missing location blocked",
    path: "/api/audit/export",
    expectedStatus: 400,
  });

  await manager.request({
    name: "Manager availability write blocked",
    path: "/api/availability",
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "RECURRING",
      dayOfWeek: 1,
      startMinute: 540,
      endMinute: 1020,
      locationId: "invalid-location",
    }),
    expectedStatus: 403,
  });

  await manager.request({
    name: "Swap queue manager",
    path: "/api/swaps",
    expectedStatus: 200,
  });

  await manager.request({
    name: "Swap decision missing id 404",
    path: "/api/swaps/non-existent/decision",
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ approve: true }),
    expectedStatus: 404,
  });

  const staffProfile = await staff.request({ name: "Staff profile read", path: "/api/profile", expectedStatus: 200 });
  await staff.request({
    name: "Staff shifts read",
    path: "/api/shifts",
    expectedStatus: 200,
  });

  await staff.request({
    name: "Staff shift create blocked",
    path: "/api/shifts",
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
    expectedStatus: 403,
  });

  const staffAvail = await staff.request({
    name: "Staff availability read",
    path: "/api/availability",
    expectedStatus: 200,
  });

  const availabilitySeedLocationId = staffAvail.payload?.data?.[0]?.locationId ?? locationId;
  let createdAvailabilityId;

  if (availabilitySeedLocationId) {
    const createdAvail = await staff.request({
      name: "Staff availability create",
      path: "/api/availability",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "RECURRING",
        dayOfWeek: 3,
        startMinute: 600,
        endMinute: 960,
        locationId: availabilitySeedLocationId,
      }),
      expectedStatus: [201, 409],
    });

    createdAvailabilityId = createdAvail.payload?.data?.id;

    if (createdAvailabilityId) {
      await staff.request({
        name: "Staff availability delete",
        path: `/api/availability/${createdAvailabilityId}`,
        method: "DELETE",
        expectedStatus: 200,
      });
    }
  }

  const preCleanupSwaps = await staff.request({
    name: "Swap list staff pre-cleanup",
    path: "/api/swaps",
    expectedStatus: 200,
  });

  for (const swapRequest of preCleanupSwaps.payload?.data ?? []) {
    const isRequester = swapRequest?.requesterId === staffProfile.payload?.data?.id;
    const isPending = swapRequest?.status === "PENDING_PEER" || swapRequest?.status === "PENDING_MANAGER";

    if (isRequester && isPending && typeof swapRequest?.id === "string") {
      await staff.request({
        name: `Swap pre-cleanup cancel ${swapRequest.id}`,
        path: `/api/swaps/${swapRequest.id}/cancel`,
        method: "POST",
        expectedStatus: 200,
      });
    }
  }

  let swapScenarioShiftAId;
  let swapScenarioShiftBId;
  let swapSamAvailabilityId;
  let swapSkyAvailabilityId;

  if (locationId && requiredSkillId && staffSamOption?.id && staffSkyOption?.id) {
    const shiftAStart = nextMondayAtUtc(13, 7);
    const shiftAEnd = new Date(shiftAStart);
    shiftAEnd.setUTCHours(shiftAEnd.getUTCHours() + 8);

    const shiftBStart = nextMondayAtUtc(13, 8);
    const shiftBEnd = new Date(shiftBStart);
    shiftBEnd.setUTCHours(shiftBEnd.getUTCHours() + 8);

    const selectedLocation = managerLocations.find((entry) => entry.id === locationId);
    const locationTimezone = selectedLocation?.timezone ?? "UTC";

    const samAvailabilityDay = getDayOfWeekInTimezone(shiftAStart, locationTimezone);
    const skyAvailabilityDay = getDayOfWeekInTimezone(shiftBStart, locationTimezone);

    const samAvailability = await staff.request({
      name: "Swap scenario availability create sam",
      path: "/api/availability",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "RECURRING",
        dayOfWeek: samAvailabilityDay,
        startMinute: 0,
        endMinute: 1439,
        locationId,
      }),
      expectedStatus: [201, 409],
    });

    swapSamAvailabilityId = samAvailability.payload?.data?.id;

    const skyAvailability = await staffSky.request({
      name: "Swap scenario availability create sky",
      path: "/api/availability",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "RECURRING",
        dayOfWeek: skyAvailabilityDay,
        startMinute: 0,
        endMinute: 1439,
        locationId,
      }),
      expectedStatus: [201, 409],
    });

    swapSkyAvailabilityId = skyAvailability.payload?.data?.id;

    const shiftA = await manager.request({
      name: "Regret swap scenario shift A create",
      path: "/api/shifts",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        locationId,
        requiredSkillId,
        startDateTime: shiftAStart.toISOString(),
        endDateTime: shiftAEnd.toISOString(),
        headcount: 1,
      }),
      expectedStatus: 201,
    });

    const shiftB = await manager.request({
      name: "Regret swap scenario shift B create",
      path: "/api/shifts",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        locationId,
        requiredSkillId,
        startDateTime: shiftBStart.toISOString(),
        endDateTime: shiftBEnd.toISOString(),
        headcount: 1,
      }),
      expectedStatus: 201,
    });

    swapScenarioShiftAId = shiftA.payload?.data?.id;
    swapScenarioShiftBId = shiftB.payload?.data?.id;

    if (swapScenarioShiftAId && swapScenarioShiftBId) {
      await manager.request({
        name: "Regret swap scenario assign sam",
        path: `/api/shifts/${swapScenarioShiftAId}/assignments`,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: staffSamOption.id }),
        expectedStatus: 201,
      });

      await manager.request({
        name: "Regret swap scenario assign sky",
        path: `/api/shifts/${swapScenarioShiftBId}/assignments`,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: staffSkyOption.id }),
        expectedStatus: 201,
      });

      const createdSwap = await staff.request({
        name: "Regret swap create",
        path: "/api/swaps",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "SWAP",
          shiftId: swapScenarioShiftAId,
          targetUserId: staffSkyOption.id,
          proposedShiftId: swapScenarioShiftBId,
          reason: "Need to switch this shift.",
        }),
        expectedStatus: 201,
      });

      const createdSwapId = createdSwap.payload?.data?.id;
      if (createdSwapId) {
        await staff.request({
          name: "Regret swap cancel before approval",
          path: `/api/swaps/${createdSwapId}/cancel`,
          method: "POST",
          expectedStatus: 200,
        });

        const swapAfterCancel = await staff.request({
          name: "Regret swap verify canceled",
          path: "/api/swaps",
          expectedStatus: 200,
        });

        const canceledSwap = (swapAfterCancel.payload?.data ?? []).find((entry) => entry?.id === createdSwapId);
        assert(canceledSwap?.status === "CANCELED", "Regret swap should be canceled after requester cancellation.");

        const requesterWeekStart = weekStartIso(shiftAStart.toISOString());
        const requesterShiftSnapshot = await manager.request({
          name: "Regret swap verify requester assignment remains",
          path: `/api/shifts?locationId=${encodeURIComponent(locationId)}&weekStartDate=${encodeURIComponent(requesterWeekStart)}`,
          expectedStatus: 200,
        });

        const requesterShift = (requesterShiftSnapshot.payload?.data ?? []).find((shift) => shift?.id === swapScenarioShiftAId);
        assert(
          Boolean(requesterShift?.assignments?.some((assignment) => assignment?.user?.id === staffSamOption.id)),
          "Requester assignment should remain on original shift after regret cancel."
        );

        const proposedShift = (requesterShiftSnapshot.payload?.data ?? []).find((shift) => shift?.id === swapScenarioShiftBId);
        assert(
          Boolean(proposedShift?.assignments?.some((assignment) => assignment?.user?.id === staffSkyOption.id)),
          "Target assignment should remain unchanged after regret cancel."
        );
      }

      const createDrop = await staff.request({
        name: "Staff drop request create",
        path: "/api/swaps",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "DROP",
          shiftId: swapScenarioShiftAId,
          reason: "Need coverage due to emergency.",
        }),
        expectedStatus: 201,
      });

      const createdDropId = createDrop.payload?.data?.id;
      if (createdDropId) {
        await staff.request({
          name: "Staff drop request cancel regret",
          path: `/api/swaps/${createdDropId}/cancel`,
          method: "POST",
          expectedStatus: 200,
        });
      }
    }
  }

  if (swapScenarioShiftAId) {
    await manager.request({
      name: "Regret swap scenario shift A delete",
      path: `/api/shifts/${swapScenarioShiftAId}`,
      method: "DELETE",
      expectedStatus: 200,
    });
  }

  if (swapScenarioShiftBId) {
    await manager.request({
      name: "Regret swap scenario shift B delete",
      path: `/api/shifts/${swapScenarioShiftBId}`,
      method: "DELETE",
      expectedStatus: 200,
    });
  }

  if (swapSamAvailabilityId) {
    await staff.request({
      name: "Swap scenario availability delete sam",
      path: `/api/availability/${swapSamAvailabilityId}`,
      method: "DELETE",
      expectedStatus: 200,
    });
  }

  if (swapSkyAvailabilityId) {
    await staffSky.request({
      name: "Swap scenario availability delete sky",
      path: `/api/availability/${swapSkyAvailabilityId}`,
      method: "DELETE",
      expectedStatus: 200,
    });
  }

  await staff.request({
    name: "Swap create invalid",
    path: "/api/swaps",
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "DROP" }),
    expectedStatus: 400,
  });

  await staff.request({
    name: "Compliance what-if invalid",
    path: "/api/compliance/what-if",
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
    expectedStatus: 403,
  });

  await staff.request({ name: "Notifications staff", path: "/api/notifications", expectedStatus: 200 });
  await staff.request({ name: "Notification prefs staff", path: "/api/notifications/preferences", expectedStatus: 200 });

  const allResults = [
    ...unauth.results,
    ...admin.results,
    ...manager.results,
    ...staff.results,
    ...staffSky.results,
    ...staffTina.results,
    ...staffAria.results,
    ...staffNoah.results,
    ...staffLeah.results,
  ];

  console.log("\n=== Essential Endpoint Smoke Results ===");
  for (const result of allResults) {
    const marker = result.pass ? "PASS" : "FAIL";
    console.log(`${marker.padEnd(5)} [${result.client}] ${result.method} ${result.path} -> ${result.status} (expected ${result.expected}) :: ${result.name}`);
  }

  const failed = allResults.filter((entry) => !entry.pass);
  console.log(`\nSummary: ${allResults.length - failed.length}/${allResults.length} checks passed.`);

  if (failed.length > 0) {
    console.log("\nFailed checks:");
    for (const failure of failed) {
      console.log(`- [${failure.client}] ${failure.method} ${failure.path}: got ${failure.status}, expected ${failure.expected} (${failure.name})`);
    }
    process.exit(1);
  }
}

run().catch((error) => {
  console.error("Smoke run failed:", error);
  process.exit(1);
});
