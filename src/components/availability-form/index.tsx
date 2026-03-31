"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/button";
import { InlineAlert } from "@/components/inline-alert";
import { Input } from "@/components/input";
import { formatDateRangeWithTimeZone, formatDateTime } from "@/lib/date-time";

export type AvailabilityFormValues =
  | {
      type: "RECURRING";
  dayOfWeeks: number[];
      startMinute: number;
      endMinute: number;
      locationIds: string[];
    }
  | {
      type: "EXCEPTION";
      startDateTime: string;
      endDateTime: string;
      locationIds: string[];
    };

type AvailabilityRecord = {
  id: string;
  type: "RECURRING" | "EXCEPTION";
  dayOfWeek: number | null;
  startMinute: number | null;
  endMinute: number | null;
  startDateTime: string | null;
  endDateTime: string | null;
  locationId: string;
  locationName?: string;
  locationTimezone?: string;
};

type AvailabilityGroup = {
  key: string;
  type: "RECURRING" | "EXCEPTION";
  label: string;
  locationLabels: string[];
  sourceIds: string[];
  sortDayOfWeek: number | null;
  sortStartMinute: number | null;
  sortStartDateTime: string | null;
};

type LocationOption = {
  id: string;
  name: string;
};

type AvailabilityFormProps = {
  locationId: string;
  locations?: LocationOption[];
  onSubmit?: (values: AvailabilityFormValues) => void | Promise<void>;
  submitPath?: string;
  submitMethod?: "POST" | "PATCH";
};

const dayNames = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function minuteToTimeValue(minutes: number) {
  const hours = Math.floor(minutes / 60)
    .toString()
    .padStart(2, "0");
  const remainder = (minutes % 60).toString().padStart(2, "0");
  return `${hours}:${remainder}`;
}

function timeValueToMinute(timeValue: string) {
  const [hours, minutes] = timeValue.split(":").map((value) => Number.parseInt(value, 10));

  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return null;
  }

  return (hours * 60) + minutes;
}

function toIsoFromDateTimeLocal(value: string) {
  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  return parsedDate.toISOString();
}

function formatValidationErrors(details: unknown) {
  if (!details || typeof details !== "object") {
    return null;
  }

  const record = details as { fieldErrors?: unknown; formErrors?: unknown };
  const messages: string[] = [];

  if (
    record.fieldErrors
    && typeof record.fieldErrors === "object"
    && !Array.isArray(record.fieldErrors)
  ) {
    const fieldMessages = Object.values(record.fieldErrors)
      .flat()
      .filter((entry) => typeof entry === "string") as string[];
    messages.push(...fieldMessages);
  }

  if (Array.isArray(record.formErrors)) {
    messages.push(
      ...record.formErrors.filter((entry): entry is string => typeof entry === "string")
    );
  }

  return messages.length > 0 ? messages.join(" ") : null;
}

function formatAvailabilityEntry(entry: AvailabilityRecord) {
  if (
    entry.type === "RECURRING"
    && entry.dayOfWeek !== null
    && entry.startMinute !== null
    && entry.endMinute !== null
  ) {
    return `${dayNames[entry.dayOfWeek]} • ${minuteToTimeValue(entry.startMinute)} to ${minuteToTimeValue(entry.endMinute)}`;
  }

  if (entry.startDateTime && entry.endDateTime) {
    return entry.locationTimezone
      ? formatDateRangeWithTimeZone(entry.startDateTime, entry.endDateTime, entry.locationTimezone)
      : `${formatDateTime(entry.startDateTime)} to ${formatDateTime(entry.endDateTime)}`;
  }

  return "Unknown availability entry";
}

function getRecurringDaySortValue(dayOfWeek: number | null) {
  if (dayOfWeek === null) {
    return Number.MAX_SAFE_INTEGER;
  }

  return dayOfWeek === 0 ? 6 : dayOfWeek - 1;
}

export function AvailabilityForm({
  locationId,
  locations,
  onSubmit,
  submitPath,
  submitMethod = "POST",
}: AvailabilityFormProps) {
  const locationOptions = useMemo<LocationOption[]>(
    () => (locations && locations.length > 0
      ? locations
      : [{ id: locationId, name: "Default location" }]),
    [locationId, locations]
  );

  const initialSelectedLocationIds = useMemo(() => {
    const ids = locationOptions.map((entry) => entry.id);

    if (ids.length > 0) {
      return ids;
    }

    return locationId ? [locationId] : [];
  }, [locationId, locationOptions]);

  const [type, setType] = useState<"RECURRING" | "EXCEPTION">("RECURRING");
  const [selectedLocationIds, setSelectedLocationIds] = useState<string[]>(initialSelectedLocationIds);
  const [selectedDayOfWeeks, setSelectedDayOfWeeks] = useState<number[]>([1]);
  const [startTime, setStartTime] = useState(minuteToTimeValue(540));
  const [endTime, setEndTime] = useState(minuteToTimeValue(1020));
  const [startDateTime, setStartDateTime] = useState("");
  const [endDateTime, setEndDateTime] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [availabilityEntries, setAvailabilityEntries] = useState<AvailabilityRecord[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadAvailabilityEntries = useCallback(async () => {
    if (!submitPath) {
      return;
    }

    setIsLoadingList(true);
    setListError(null);

    try {
      const response = await fetch(submitPath, { method: "GET" });

      if (!response.ok) {
        setListError("Could not load existing availability entries.");
        return;
      }

      const payload = await response.json();
      const entries = Array.isArray(payload?.data)
        ? (payload.data as AvailabilityRecord[])
        : [];
      setAvailabilityEntries(entries);
    } catch {
      setListError("Could not load existing availability entries.");
    } finally {
      setIsLoadingList(false);
    }
  }, [submitPath]);

  useEffect(() => {
    if (!successMessage) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setSuccessMessage(null);
    }, 30000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [successMessage]);

  useEffect(() => {
    const nextLocationIds = locationOptions.map((entry) => entry.id);

    setSelectedLocationIds((current) => {
      const stillValid = current.filter((entry) => nextLocationIds.includes(entry));
      let nextSelection: string[];

      if (stillValid.length > 0) {
        nextSelection = stillValid;
      } else if (nextLocationIds.length > 0) {
        nextSelection = nextLocationIds;
      } else if (locationId) {
        nextSelection = [locationId];
      } else {
        nextSelection = [];
      }

      if (
        current.length === nextSelection.length
        && current.every((entry, index) => entry === nextSelection[index])
      ) {
        return current;
      }

      return nextSelection;
    });
  }, [locationId, locationOptions]);

  useEffect(() => {
    void loadAvailabilityEntries();
  }, [loadAvailabilityEntries]);

  const recurringStartMinute = timeValueToMinute(startTime);
  const recurringEndMinute = timeValueToMinute(endTime);
  const isRecurringValid =
    selectedDayOfWeeks.length > 0
    && recurringStartMinute !== null
    && recurringEndMinute !== null
    && recurringEndMinute > recurringStartMinute;
  const isExceptionValid = Boolean(startDateTime) && Boolean(endDateTime);
  const isSubmitDisabled =
    isSubmitting
    || selectedLocationIds.length === 0
    || (type === "RECURRING" ? !isRecurringValid : !isExceptionValid);

  const groupedAvailabilityEntries: AvailabilityGroup[] = availabilityEntries.reduce<AvailabilityGroup[]>(
    (groups, entry) => {
      const recurringKey =
        entry.type === "RECURRING"
          ? `RECURRING:${entry.dayOfWeek}:${entry.startMinute}:${entry.endMinute}`
          : "";
      const exceptionKey =
        entry.type === "EXCEPTION"
          ? `EXCEPTION:${entry.startDateTime ?? ""}:${entry.endDateTime ?? ""}`
          : "";
      const key = entry.type === "RECURRING" ? recurringKey : exceptionKey;

      if (!key) {
        return groups;
      }

      const locationLabel = entry.locationName
        ? `${entry.locationName}${entry.locationTimezone ? ` (${entry.locationTimezone})` : ""}`
        : entry.locationId;

      const existingGroup = groups.find((group) => group.key === key);

      if (existingGroup) {
        if (!existingGroup.locationLabels.includes(locationLabel)) {
          existingGroup.locationLabels.push(locationLabel);
        }
        existingGroup.sourceIds.push(entry.id);
        return groups;
      }

      groups.push({
        key,
        type: entry.type,
        label: formatAvailabilityEntry(entry),
        locationLabels: [locationLabel],
        sourceIds: [entry.id],
        sortDayOfWeek: entry.type === "RECURRING" ? entry.dayOfWeek : null,
        sortStartMinute: entry.type === "RECURRING" ? entry.startMinute : null,
        sortStartDateTime: entry.type === "EXCEPTION" ? entry.startDateTime : null,
      });

      return groups;
    },
    []
  );

  const sortedAvailabilityGroups = [...groupedAvailabilityEntries].sort((left, right) => {
    if (left.type === "RECURRING" && right.type === "RECURRING") {
      const dayDiff = getRecurringDaySortValue(left.sortDayOfWeek) - getRecurringDaySortValue(right.sortDayOfWeek);
      if (dayDiff !== 0) {
        return dayDiff;
      }

      const startMinuteDiff = (left.sortStartMinute ?? 0) - (right.sortStartMinute ?? 0);
      if (startMinuteDiff !== 0) {
        return startMinuteDiff;
      }

      return left.label.localeCompare(right.label);
    }

    if (left.type === "RECURRING") {
      return -1;
    }

    if (right.type === "RECURRING") {
      return 1;
    }

    return (left.sortStartDateTime ?? "").localeCompare(right.sortStartDateTime ?? "");
  });

  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setIsSubmitting(true);
        setErrorMessage(null);
        setSuccessMessage(null);

        const values: AvailabilityFormValues =
          type === "RECURRING"
            ? (() => {
                const parsedStartMinute = timeValueToMinute(startTime);
                const parsedEndMinute = timeValueToMinute(endTime);

                if (
                  parsedStartMinute === null
                  || parsedEndMinute === null
                  || parsedEndMinute <= parsedStartMinute
                ) {
                  throw new Error("Recurring availability requires a valid start and end time.");
                }

                return {
                  type,
                  dayOfWeeks: Array.from(new Set(selectedDayOfWeeks)).sort((a, b) => a - b),
                  startMinute: parsedStartMinute,
                  endMinute: parsedEndMinute,
                  locationIds: selectedLocationIds,
                };
              })()
            : {
                type,
                startDateTime: toIsoFromDateTimeLocal(startDateTime),
                endDateTime: toIsoFromDateTimeLocal(endDateTime),
                locationIds: selectedLocationIds,
              };

        try {
          if (onSubmit) {
            await onSubmit(values);
            setSuccessMessage("Availability saved successfully.");
            return;
          }

          if (!submitPath) {
            setErrorMessage("Save is not configured for this form.");
            return;
          }

          const response = await fetch(submitPath, {
            method: submitMethod,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(values),
          });

          if (!response.ok) {
            let apiError: string | null = null;
            try {
              const responseBody = await response.json();
              const parsedError = responseBody?.error;
              const detailMessage = formatValidationErrors(responseBody?.details);
              if (typeof parsedError === "string") {
                apiError = parsedError;
              }
              if (detailMessage) {
                apiError = detailMessage;
              }
            } catch {
              apiError = null;
            }

            setErrorMessage(apiError ?? "Could not save availability. Please try again.");
            return;
          }

          setSuccessMessage("Availability saved successfully.");
          await loadAvailabilityEntries();
        } catch (error) {
          setErrorMessage(
            error instanceof Error && error.message
              ? error.message
              : "Unable to save availability right now. Please try again."
          );
        } finally {
          setIsSubmitting(false);
        }
      }}
    >
      {errorMessage ? (
        <InlineAlert variant="error">
          {errorMessage}
        </InlineAlert>
      ) : null}

      {successMessage ? (
        <InlineAlert variant="success">
          {successMessage}
        </InlineAlert>
      ) : null}

      <div className="space-y-2">
        <label className="text-sm font-medium text-zinc-700">
          Applies to locations
        </label>
        <div className="space-y-2 rounded-md border border-zinc-200 bg-zinc-50 p-3">
          <p className="text-xs text-zinc-600">
            Select one or more locations. The same availability window is saved for each selected location timezone.
          </p>
          {locationOptions.map((locationOption) => (
            <label
              key={locationOption.id}
              htmlFor={`availability-location-${locationOption.id}`}
              className="flex items-center gap-2 text-sm text-zinc-800"
            >
              <input
                id={`availability-location-${locationOption.id}`}
                type="checkbox"
                className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
                checked={selectedLocationIds.includes(locationOption.id)}
                disabled={isSubmitting}
                onChange={(event) => {
                  setSelectedLocationIds((current) => {
                    if (event.target.checked) {
                      return Array.from(new Set([...current, locationOption.id]));
                    }

                    return current.filter((entry) => entry !== locationOption.id);
                  });
                }}
              />
              <span>{locationOption.name}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="availability-type" className="text-sm font-medium text-zinc-700">
          Type
        </label>
        <select
          id="availability-type"
          className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
          value={type}
          onChange={(event) =>
            setType(event.target.value as "RECURRING" | "EXCEPTION")
          }
          disabled={isSubmitting}
        >
          <option value="RECURRING">Recurring</option>
          <option value="EXCEPTION">Exception</option>
        </select>
      </div>

      {type === "RECURRING" ? (
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-700">
              Days
            </label>
            <div className="space-y-2 rounded-md border border-zinc-200 bg-zinc-50 p-3">
              <p className="text-xs text-zinc-600">
                Select all days this recurring window applies to.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={isSubmitting}
                  onClick={() => setSelectedDayOfWeeks([0, 1, 2, 3, 4, 5, 6])}
                >
                  Select all
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={isSubmitting}
                  onClick={() => setSelectedDayOfWeeks([])}
                >
                  Clear all
                </Button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {dayNames.map((dayName, index) => (
                  <label
                    key={dayName}
                    htmlFor={`availability-day-${index}`}
                    className="flex items-center gap-2 text-sm text-zinc-800"
                  >
                    <input
                      id={`availability-day-${index}`}
                      type="checkbox"
                      className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
                      checked={selectedDayOfWeeks.includes(index)}
                      disabled={isSubmitting}
                      onChange={(event) => {
                        setSelectedDayOfWeeks((current) => {
                          if (event.target.checked) {
                            return Array.from(new Set([...current, index])).sort((a, b) => a - b);
                          }

                          return current.filter((entry) => entry !== index);
                        });
                      }}
                    />
                    <span>{dayName}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="availability-start" className="text-sm font-medium text-zinc-700">
                Start time
              </label>
              <Input
                id="availability-start"
                type="time"
                value={startTime}
                onChange={(event) => setStartTime(event.target.value)}
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="availability-end" className="text-sm font-medium text-zinc-700">
                End time
              </label>
              <Input
                id="availability-end"
                type="time"
                value={endTime}
                onChange={(event) => setEndTime(event.target.value)}
                disabled={isSubmitting}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor="availability-exception-start" className="text-sm font-medium text-zinc-700">
              Start
            </label>
            <Input
              id="availability-exception-start"
              type="datetime-local"
              value={startDateTime}
              onChange={(event) => setStartDateTime(event.target.value)}
              disabled={isSubmitting}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="availability-exception-end" className="text-sm font-medium text-zinc-700">
              End
            </label>
            <Input
              id="availability-exception-end"
              type="datetime-local"
              value={endDateTime}
              onChange={(event) => setEndDateTime(event.target.value)}
              disabled={isSubmitting}
            />
          </div>
        </div>
      )}

      <Button type="submit" disabled={isSubmitDisabled}>
        {isSubmitting ? "Saving..." : "Add availability"}
      </Button>

      <div className="space-y-2 border-t border-zinc-200 pt-4">
        <h2 className="text-sm font-semibold text-zinc-900">Existing availability</h2>

        {listError ? (
          <InlineAlert variant="error">{listError}</InlineAlert>
        ) : null}

        {isLoadingList ? (
          <p className="text-sm text-zinc-600">Loading availability...</p>
        ) : sortedAvailabilityGroups.length > 0 ? (
          <ul className="space-y-2">
            {sortedAvailabilityGroups.map((group) => (
              <li
                key={group.key}
                className="flex items-center justify-between gap-3 rounded-md border border-zinc-200 bg-white px-3 py-2"
              >
                <div className="space-y-1">
                  <p className="text-sm text-zinc-700">{group.label}</p>
                  <p className="text-xs text-zinc-500">
                    Locations: {group.locationLabels.sort((a, b) => a.localeCompare(b)).join(", ")}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  className="border-zinc-300"
                  disabled={Boolean(isDeletingId) || isSubmitting}
                  onClick={async () => {
                    if (!submitPath) {
                      return;
                    }

                    setErrorMessage(null);
                    setSuccessMessage(null);
                    setIsDeletingId(group.key);

                    try {
                      const deleteResponses = await Promise.all(
                        group.sourceIds.map(async (sourceId) => {
                          const response = await fetch(`${submitPath}/${sourceId}`, {
                            method: "DELETE",
                          });

                          if (!response.ok) {
                            const responseBody = await response.json().catch(() => null);
                            return {
                              ok: false,
                              message:
                                typeof responseBody?.error === "string"
                                  ? responseBody.error
                                  : "Could not delete availability. Please try again.",
                            };
                          }

                          return { ok: true, message: "" };
                        })
                      );

                      const failedDelete = deleteResponses.find((response) => !response.ok);
                      if (failedDelete) {
                        setErrorMessage(failedDelete.message);
                        return;
                      }

                      setSuccessMessage("Availability deleted successfully.");
                      await loadAvailabilityEntries();
                    } catch {
                      setErrorMessage("Could not delete availability. Please try again.");
                    } finally {
                      setIsDeletingId(null);
                    }
                  }}
                >
                  {isDeletingId === group.key ? "Deleting..." : "Delete"}
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-600">No availability entries yet.</p>
        )}
      </div>
    </form>
  );
}
