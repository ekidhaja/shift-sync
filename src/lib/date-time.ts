const defaultDateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function getDate(value: string | Date) {
  return value instanceof Date ? value : new Date(value);
}

function getTimeZoneLabel(value: Date, timeZone?: string) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "short",
    }).formatToParts(value);

    return parts.find((part) => part.type === "timeZoneName")?.value ?? null;
  } catch {
    return null;
  }
}

function formatDateTimeInTimeZone(value: Date, timeZone?: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(value);
}

export function formatDateTime(value: string | Date) {
  const parsed = getDate(value);

  if (Number.isNaN(parsed.getTime())) {
    return "Invalid date";
  }

  return defaultDateTimeFormatter.format(parsed);
}

export function formatDateTimeWithTimeZone(value: string | Date, timeZone?: string) {
  const parsed = getDate(value);

  if (Number.isNaN(parsed.getTime())) {
    return "Invalid date";
  }

  const formatted = formatDateTimeInTimeZone(parsed, timeZone);
  const timeZoneLabel = getTimeZoneLabel(parsed, timeZone);

  return timeZoneLabel ? `${formatted} (${timeZoneLabel})` : formatted;
}

export function formatDateRangeWithTimeZone(
  startValue: string | Date,
  endValue: string | Date,
  timeZone?: string
) {
  const start = getDate(startValue);
  const end = getDate(endValue);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return "Invalid date range";
  }

  const startText = formatDateTimeInTimeZone(start, timeZone);
  const endText = formatDateTimeInTimeZone(end, timeZone);
  const timeZoneLabel = getTimeZoneLabel(start, timeZone);

  return timeZoneLabel
    ? `${startText} — ${endText} (${timeZoneLabel})`
    : `${startText} — ${endText}`;
}
