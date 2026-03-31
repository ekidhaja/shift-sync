type DateTimeLocalParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const dateTimeLocalPattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

function parseDateTimeLocal(value: string): DateTimeLocalParts | null {
  const match = value.match(dateTimeLocalPattern);

  if (!match) {
    return null;
  }

  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  const hour = Number.parseInt(match[4], 10);
  const minute = Number.parseInt(match[5], 10);
  const second = Number.parseInt(match[6] ?? "0", 10);

  if (
    Number.isNaN(year)
    || Number.isNaN(month)
    || Number.isNaN(day)
    || Number.isNaN(hour)
    || Number.isNaN(minute)
    || Number.isNaN(second)
  ) {
    return null;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) {
    return null;
  }

  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
  };
}

function getTimeZoneParts(date: Date, timeZone: string): DateTimeLocalParts | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date);

    const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));

    const year = Number.parseInt(lookup.year ?? "", 10);
    const month = Number.parseInt(lookup.month ?? "", 10);
    const day = Number.parseInt(lookup.day ?? "", 10);
    const hour = Number.parseInt(lookup.hour ?? "", 10);
    const minute = Number.parseInt(lookup.minute ?? "", 10);
    const second = Number.parseInt(lookup.second ?? "", 10);

    if (
      Number.isNaN(year)
      || Number.isNaN(month)
      || Number.isNaN(day)
      || Number.isNaN(hour)
      || Number.isNaN(minute)
      || Number.isNaN(second)
    ) {
      return null;
    }

    return {
      year,
      month,
      day,
      hour,
      minute,
      second,
    };
  } catch {
    return null;
  }
}

export function convertDateTimeLocalToUtc(dateTimeLocal: string, timeZone: string): Date | null {
  const target = parseDateTimeLocal(dateTimeLocal);

  if (!target) {
    return null;
  }

  const targetLocalMillis = Date.UTC(
    target.year,
    target.month - 1,
    target.day,
    target.hour,
    target.minute,
    target.second
  );

  let utcMillis = targetLocalMillis;

  for (let index = 0; index < 3; index += 1) {
    const zoned = getTimeZoneParts(new Date(utcMillis), timeZone);

    if (!zoned) {
      return null;
    }

    const zonedLocalMillis = Date.UTC(
      zoned.year,
      zoned.month - 1,
      zoned.day,
      zoned.hour,
      zoned.minute,
      zoned.second
    );

    const diff = targetLocalMillis - zonedLocalMillis;

    if (diff === 0) {
      return new Date(utcMillis);
    }

    utcMillis += diff;
  }

  return new Date(utcMillis);
}

export function convertDateTimeLocalToUtcIso(dateTimeLocal: string, timeZone: string): string | null {
  const converted = convertDateTimeLocalToUtc(dateTimeLocal, timeZone);
  return converted ? converted.toISOString() : null;
}
