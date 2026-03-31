"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/button";
import { InlineAlert } from "@/components/inline-alert";
import { Input } from "@/components/input";
import { RealtimeStatusIndicator } from "@/components/realtime-status-indicator";
import { formatDateRangeWithTimeZone } from "@/lib/date-time";
import { getRealtimeWebSocketUrl } from "@/lib/realtime-client";
import { convertDateTimeLocalToUtcIso } from "@/lib/timezone";

type UserRole = "ADMIN" | "MANAGER" | "STAFF";

type OptionLocation = { id: string; name: string; timezone: string };
type OptionSkill = { id: string; name: string };
type OptionStaff = {
  id: string;
  name: string | null;
  email: string | null;
  certifications: Array<{ locationId: string }>;
  skills: Array<{ skillId: string }>;
};

type Shift = {
  id: string;
  locationId: string;
  requiredSkillId: string;
  startDateTime: string;
  endDateTime: string;
  headcount: number;
  status: "DRAFT" | "PUBLISHED";
  temporalStatus?: "PAST" | "UPCOMING";
  location: { name: string; timezone: string };
  requiredSkill: { name: string };
  assignments: Array<{
    id: string;
    clockInAt?: string | null;
    clockOutAt?: string | null;
    servedStatus?: "SERVED" | "MISSED" | null;
    user: { id: string; name: string | null; email: string | null };
  }>;
  scheduleWeek: { weekStartDate: string; isPublished: boolean; cutoffHours: number };
};

type Violation = { code: string; message: string };
type Alternative = { userId: string; name: string | null; email: string | null; reasons: string[] };

function toWeekStartFromDateTime(dateTime: string) {
  const date = new Date(dateTime);
  const normalized = new Date(date);
  normalized.setUTCHours(0, 0, 0, 0);
  const day = normalized.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  normalized.setUTCDate(normalized.getUTCDate() + diff);
  return normalized.toISOString();
}

function toDateInputValue(isoDateTime: string) {
  return new Date(isoDateTime).toISOString().slice(0, 10);
}

function currentWeekStartIso() {
  return toWeekStartFromDateTime(new Date().toISOString());
}

function shiftStatusPillClass(status: "DRAFT" | "PUBLISHED") {
  return status === "PUBLISHED"
    ? "border-emerald-200 bg-emerald-100 text-emerald-800"
    : "border-zinc-200 bg-zinc-100 text-zinc-700";
}

function timingPillClass(timing: "PAST" | "UPCOMING" | undefined) {
  return timing === "PAST"
    ? "border-amber-200 bg-amber-100 text-amber-800"
    : "border-blue-200 bg-blue-100 text-blue-800";
}

function servedStatusPillClass(servedStatus: "SERVED" | "MISSED" | null | undefined) {
  return servedStatus === "SERVED"
    ? "border-emerald-200 bg-emerald-100 text-emerald-800"
    : "border-rose-200 bg-rose-100 text-rose-800";
}

type ScheduleBoardProps = {
  role: UserRole;
};

export function ScheduleBoard({ role }: ScheduleBoardProps) {
  const [locations, setLocations] = useState<OptionLocation[]>([]);
  const [skills, setSkills] = useState<OptionSkill[]>([]);
  const [staff, setStaff] = useState<OptionStaff[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);

  const [createLocationId, setCreateLocationId] = useState("");
  const [listLocationId, setListLocationId] = useState("");
  const [listWeekStartDate, setListWeekStartDate] = useState(() => currentWeekStartIso());
  const [listTimeRange, setListTimeRange] = useState<"upcoming" | "past" | "week">("upcoming");
  const [requiredSkillId, setRequiredSkillId] = useState("");
  const [startDateTime, setStartDateTime] = useState("");
  const [endDateTime, setEndDateTime] = useState("");
  const [headcount, setHeadcount] = useState("1");
  const [assignStaffByShift, setAssignStaffByShift] = useState<Record<string, string>>({});
  const [overrideReasonByShift, setOverrideReasonByShift] = useState<Record<string, string>>({});

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [violations, setViolations] = useState<Violation[]>([]);
  const [alternatives, setAlternatives] = useState<Alternative[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isShiftListLoading, setIsShiftListLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);
  const [assigningShiftId, setAssigningShiftId] = useState<string | null>(null);
  const [removingAssignmentId, setRemovingAssignmentId] = useState<string | null>(null);
  const [deletingShiftId, setDeletingShiftId] = useState<string | null>(null);
  const [exportFromDate, setExportFromDate] = useState("");
  const [exportToDate, setExportToDate] = useState("");
  const [isExportingAudit, setIsExportingAudit] = useState(false);

  async function loadOptions() {
    const response = await fetch("/api/shifts/options");
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(typeof payload?.error === "string" ? payload.error : "Could not load scheduler options.");
    }

    const payload = await response.json();
    const data = payload?.data ?? {};

    setLocations(Array.isArray(data.locations) ? data.locations : []);
    setSkills(Array.isArray(data.skills) ? data.skills : []);
    setStaff(Array.isArray(data.staff) ? data.staff : []);

    const nextLocationId = (Array.isArray(data.locations) && data.locations.length > 0)
      ? data.locations[0].id
      : "";
    const nextSkillId = (Array.isArray(data.skills) && data.skills.length > 0)
      ? data.skills[0].id
      : "";

    setCreateLocationId((current) => current || nextLocationId);
    setListLocationId((current) => current || nextLocationId);
    setRequiredSkillId((current) => current || nextSkillId);
  }

  async function loadShifts(
    targetLocationId?: string,
    targetWeekStart?: string,
    targetTimeRange: "upcoming" | "past" | "week" = listTimeRange,
    options?: { showLoading?: boolean }
  ) {
    const showLoading = options?.showLoading === true;

    if (showLoading) {
      setIsShiftListLoading(true);
    }

    try {
      if (!targetLocationId || (targetTimeRange === "week" && !targetWeekStart)) {
        setShifts([]);
        return;
      }

      const query = new URLSearchParams({
        locationId: targetLocationId,
        timeRange: targetTimeRange,
      });

      if (targetTimeRange === "week" && targetWeekStart) {
        query.set("weekStartDate", targetWeekStart);
      }

      const response = await fetch(`/api/shifts?${query.toString()}`);
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(typeof payload?.error === "string" ? payload.error : "Could not load shifts.");
      }

      const payload = await response.json();
      setShifts(Array.isArray(payload?.data) ? payload.data : []);
    } finally {
      if (showLoading) {
        setIsShiftListLoading(false);
      }
    }
  }

  useEffect(() => {
    async function loadInitial() {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        await loadOptions();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Could not load schedule data.");
      } finally {
        setIsLoading(false);
      }
    }

    void loadInitial();
  }, []);

  const skillNameById = useMemo(
    () => Object.fromEntries(skills.map((skill) => [skill.id, skill.name])),
    [skills]
  );

  useEffect(() => {
    if (!listLocationId || !listWeekStartDate) {
      return;
    }

    void loadShifts(listLocationId, listWeekStartDate, listTimeRange, { showLoading: true }).catch((error: unknown) => {
      setErrorMessage(error instanceof Error ? error.message : "Could not load shifts.");
    });
  }, [listLocationId, listWeekStartDate, listTimeRange]);

  useEffect(() => {
    const wsUrl = getRealtimeWebSocketUrl();
    if (!wsUrl) {
      setIsRealtimeConnected(false);
      return;
    }

    const socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      setIsRealtimeConnected(true);
    };

    socket.onerror = () => {
      setIsRealtimeConnected(false);
    };

    socket.onclose = () => {
      setIsRealtimeConnected(false);
    };

    socket.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data) as { type?: string; payload?: { locationId?: string } };

        if (
          (parsed.type === "schedule.updated" || parsed.type === "swap.updated" || parsed.type === "conflict.detected")
          && listLocationId
          && listWeekStartDate
          && (!parsed.payload?.locationId || parsed.payload.locationId === listLocationId)
        ) {
          void loadShifts(listLocationId, listWeekStartDate, listTimeRange);
        }
      } catch {
        return;
      }
    };

    return () => {
      socket.close();
    };
  }, [listLocationId, listTimeRange, listWeekStartDate]);

  if (isLoading) {
    return <p className="text-sm text-zinc-600">Loading scheduler...</p>;
  }

  const locationStaff = staff.filter((entry) =>
    entry.certifications.some((certification) => certification.locationId === listLocationId)
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <RealtimeStatusIndicator isConnected={isRealtimeConnected} />
      </div>
      {errorMessage ? <InlineAlert variant="error">{errorMessage}</InlineAlert> : null}
      {successMessage ? <InlineAlert variant="success">{successMessage}</InlineAlert> : null}

      {violations.length > 0 ? (
        <InlineAlert variant="error">
          <div className="space-y-1">
            <p className="font-semibold">Constraint violations</p>
            {violations.map((violation) => (
              <p key={`${violation.code}-${violation.message}`}>- {violation.message}</p>
            ))}
            {alternatives.length > 0 ? (
              <div className="pt-2">
                <p className="font-semibold">Suggested alternatives</p>
                {alternatives.map((alternative) => (
                  <p key={alternative.userId}>
                    - {alternative.name ?? "Unnamed"}
                    {alternative.email ? ` (${alternative.email})` : ""}
                  </p>
                ))}
              </div>
            ) : null}
          </div>
        </InlineAlert>
      ) : null}

      <section className="space-y-4 rounded-md border border-zinc-200 bg-white p-4">
        <h2 className="text-base font-semibold text-zinc-900">Create shift</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor="schedule-location" className="text-sm font-medium text-zinc-700">Location</label>
            <select
              id="schedule-location"
              className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
              value={createLocationId}
              onChange={(event) => setCreateLocationId(event.target.value)}
              disabled={isSaving || isPublishing}
            >
              {locations.map((location) => (
                <option key={location.id} value={location.id}>{location.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="schedule-skill" className="text-sm font-medium text-zinc-700">Required skill</label>
            <select
              id="schedule-skill"
              className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
              value={requiredSkillId}
              onChange={(event) => setRequiredSkillId(event.target.value)}
              disabled={isSaving || isPublishing}
            >
              {skills.map((skill) => (
                <option key={skill.id} value={skill.id}>{skill.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="schedule-start" className="text-sm font-medium text-zinc-700">Start</label>
            <Input id="schedule-start" type="datetime-local" value={startDateTime} onChange={(event) => setStartDateTime(event.target.value)} disabled={isSaving || isPublishing} />
          </div>

          <div className="space-y-2">
            <label htmlFor="schedule-end" className="text-sm font-medium text-zinc-700">End</label>
            <Input id="schedule-end" type="datetime-local" value={endDateTime} onChange={(event) => setEndDateTime(event.target.value)} disabled={isSaving || isPublishing} />
          </div>

          <div className="space-y-2">
            <label htmlFor="schedule-headcount" className="text-sm font-medium text-zinc-700">Headcount</label>
            <Input id="schedule-headcount" type="number" value={headcount} min={1} max={20} onChange={(event) => setHeadcount(event.target.value)} disabled={isSaving || isPublishing} />
          </div>
        </div>

        <Button
          type="button"
          disabled={isSaving || isPublishing || !createLocationId || !requiredSkillId || !startDateTime || !endDateTime}
          onClick={async () => {
            setIsSaving(true);
            setErrorMessage(null);
            setSuccessMessage(null);

            try {
              const selectedCreateLocation = locations.find(
                (location) => location.id === createLocationId
              );

              if (!selectedCreateLocation) {
                setErrorMessage("Could not resolve location timezone.");
                return;
              }

              const normalizedStartDateTime = convertDateTimeLocalToUtcIso(
                startDateTime,
                selectedCreateLocation.timezone
              );
              const normalizedEndDateTime = convertDateTimeLocalToUtcIso(
                endDateTime,
                selectedCreateLocation.timezone
              );

              if (!normalizedStartDateTime || !normalizedEndDateTime) {
                setErrorMessage("Enter valid start and end date-times.");
                return;
              }

              const response = await fetch("/api/shifts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  locationId: createLocationId,
                  requiredSkillId,
                  startDateTime: normalizedStartDateTime,
                  endDateTime: normalizedEndDateTime,
                  headcount: Number.parseInt(headcount, 10) || 1,
                }),
              });

              if (!response.ok) {
                const body = await response.json().catch(() => null);
                setErrorMessage(typeof body?.error === "string" ? body.error : "Could not create shift.");
                return;
              }

              setSuccessMessage("Shift created successfully.");
              await loadShifts(listLocationId, listWeekStartDate, listTimeRange);
            } catch {
              setErrorMessage("Could not create shift.");
            } finally {
              setIsSaving(false);
            }
          }}
        >
          {isSaving ? "Saving..." : "Create shift"}
        </Button>
      </section>

      <section className="space-y-3 rounded-md border border-zinc-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-zinc-900">Week schedule</h2>
          <Button
            type="button"
            variant="secondary"
            disabled={isPublishing || isSaving || !listLocationId || !listWeekStartDate}
            onClick={async () => {
              if (!listLocationId || !listWeekStartDate) return;
              setErrorMessage(null);
              setSuccessMessage(null);
              setIsPublishing(true);

              try {
                const hasDraft = shifts.some((shift) => shift.status === "DRAFT");

                const response = await fetch("/api/shifts/publish", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    locationId: listLocationId,
                    weekStartDate: listWeekStartDate,
                    publish: hasDraft,
                  }),
                });

                if (!response.ok) {
                  const body = await response.json().catch(() => null);
                  setErrorMessage(typeof body?.details === "string" ? body.details : "Could not update publish state.");
                  return;
                }

                setSuccessMessage(hasDraft ? "Schedule published." : "Schedule unpublished.");
                await loadShifts(listLocationId, listWeekStartDate, listTimeRange);
              } finally {
                setIsPublishing(false);
              }
            }}
          >
            {isPublishing
              ? "Updating..."
              : shifts.some((shift) => shift.status === "DRAFT")
                ? "Publish week"
                : "Unpublish week"}
          </Button>
        </div>

        <p className="text-xs text-zinc-500">
          Listing controls are independent from the create-shift form above.
        </p>

        <div className="grid gap-3 md:grid-cols-4">
          <div className="space-y-2">
            <label htmlFor="list-location" className="text-sm font-medium text-zinc-700">List location</label>
            <select
              id="list-location"
              className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
              value={listLocationId}
              onChange={(event) => setListLocationId(event.target.value)}
              disabled={isSaving || isPublishing || isShiftListLoading}
            >
              {locations.map((location) => (
                <option key={location.id} value={location.id}>{location.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="list-range" className="text-sm font-medium text-zinc-700">View</label>
            <select
              id="list-range"
              className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
              value={listTimeRange}
              onChange={(event) => setListTimeRange(event.target.value as "upcoming" | "past" | "week")}
              disabled={isSaving || isPublishing || isShiftListLoading}
            >
              <option value="upcoming">Upcoming shifts</option>
              <option value="past">Past shifts</option>
              <option value="week">Specific week</option>
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="list-week" className="text-sm font-medium text-zinc-700">Week of</label>
            <Input
              id="list-week"
              type="date"
              value={toDateInputValue(listWeekStartDate)}
              onChange={(event) => {
                if (!event.target.value) {
                  return;
                }
                setListWeekStartDate(toWeekStartFromDateTime(`${event.target.value}T00:00:00.000Z`));
              }}
              disabled={isSaving || isPublishing || isShiftListLoading || listTimeRange !== "week"}
            />
          </div>

          <div className="flex items-end">
            <Button
              type="button"
              variant="ghost"
              disabled={isSaving || isPublishing || isShiftListLoading}
              onClick={() => setListWeekStartDate(currentWeekStartIso())}
            >
              Current week
            </Button>
          </div>
        </div>

        {isShiftListLoading ? (
          <p className="text-sm text-zinc-600">Loading filtered schedule...</p>
        ) : null}

        {role === "ADMIN" ? (
          <div className="space-y-3 rounded-md border border-zinc-200 bg-zinc-50 p-3">
            <p className="text-sm font-semibold text-zinc-900">Audit export</p>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-2">
                <label htmlFor="audit-from" className="text-sm font-medium text-zinc-700">From (optional)</label>
                <Input
                  id="audit-from"
                  type="datetime-local"
                  value={exportFromDate}
                  onChange={(event) => setExportFromDate(event.target.value)}
                  disabled={isExportingAudit}
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="audit-to" className="text-sm font-medium text-zinc-700">To (optional)</label>
                <Input
                  id="audit-to"
                  type="datetime-local"
                  value={exportToDate}
                  onChange={(event) => setExportToDate(event.target.value)}
                  disabled={isExportingAudit}
                />
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={isExportingAudit}
                  onClick={async () => {
                    setErrorMessage(null);
                    setSuccessMessage(null);
                    setIsExportingAudit(true);

                    try {
                      const query = new URLSearchParams();
                      if (exportFromDate) {
                        query.set("from", new Date(exportFromDate).toISOString());
                      }
                      if (exportToDate) {
                        query.set("to", new Date(exportToDate).toISOString());
                      }

                      const response = await fetch(`/api/audit/export?${query.toString()}`);

                      if (!response.ok) {
                        const body = await response.json().catch(() => null);
                        setErrorMessage(typeof body?.details === "string" ? body.details : "Could not export audit log.");
                        return;
                      }

                      const blob = await response.blob();
                      const downloadUrl = URL.createObjectURL(blob);
                      const link = document.createElement("a");
                      link.href = downloadUrl;
                      link.download = "audit-export.csv";
                      document.body.appendChild(link);
                      link.click();
                      link.remove();
                      URL.revokeObjectURL(downloadUrl);

                      setSuccessMessage("Audit export downloaded.");
                    } finally {
                      setIsExportingAudit(false);
                    }
                  }}
                >
                  {isExportingAudit ? "Exporting..." : "Export CSV"}
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {!isShiftListLoading && shifts.length === 0 ? (
          <p className="text-sm text-zinc-600">No shifts for this week yet.</p>
        ) : !isShiftListLoading ? (
          <ul className="space-y-3">
            {shifts.map((shift) => (
              <li key={shift.id} className="space-y-3 rounded-md border border-zinc-200 bg-zinc-50 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-zinc-900">
                      {shift.location.name} · {shift.requiredSkill.name}
                    </p>
                    <p className="text-sm text-zinc-600">
                      {formatDateRangeWithTimeZone(shift.startDateTime, shift.endDateTime, shift.location.timezone)}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${shiftStatusPillClass(shift.status)}`}>
                        {shift.status}
                      </span>
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${timingPillClass(shift.temporalStatus)}`}>
                        {shift.temporalStatus ?? "UPCOMING"}
                      </span>
                      <span className="inline-flex items-center rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-xs font-medium text-zinc-700">
                        Headcount {shift.assignments.length}/{shift.headcount}
                      </span>
                    </div>
                  </div>
                  {shift.temporalStatus !== "PAST" ? (
                    <Button
                      type="button"
                      variant="secondary"
                      className="border-zinc-300"
                      disabled={
                        Boolean(assigningShiftId)
                        || Boolean(removingAssignmentId)
                        || Boolean(deletingShiftId)
                        || isPublishing
                        || isSaving
                      }
                      onClick={async () => {
                        setErrorMessage(null);
                        setSuccessMessage(null);
                        setDeletingShiftId(shift.id);

                        try {
                          const response = await fetch(`/api/shifts/${shift.id}`, {
                            method: "DELETE",
                          });

                          if (!response.ok) {
                            const body = await response.json().catch(() => null);
                            setErrorMessage(
                              typeof body?.details === "string"
                                ? body.details
                                : typeof body?.error === "string"
                                  ? body.error
                                  : "Could not delete shift."
                            );
                            return;
                          }

                          setSuccessMessage(
                            shift.status === "DRAFT"
                              ? "Draft shift deleted successfully."
                              : "Shift deleted successfully."
                          );
                          await loadShifts(listLocationId, listWeekStartDate, listTimeRange);
                        } finally {
                          setDeletingShiftId(null);
                        }
                      }}
                    >
                      {deletingShiftId === shift.id
                        ? "Deleting..."
                        : shift.status === "DRAFT"
                          ? "Delete draft"
                          : "Delete shift"}
                    </Button>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium text-zinc-700">Assignments</p>
                  {shift.assignments.length === 0 ? (
                    <p className="text-sm text-zinc-500">No one assigned yet.</p>
                  ) : (
                    <ul className="space-y-1">
                      {shift.assignments.map((assignment) => (
                        <li key={assignment.id} className="flex items-center justify-between text-sm text-zinc-700">
                          <div className="flex flex-wrap items-center gap-2">
                            <span>{assignment.user.name ?? "Unnamed"}{assignment.user.email ? ` (${assignment.user.email})` : ""}</span>
                            {shift.temporalStatus === "PAST" ? (
                              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${servedStatusPillClass(assignment.servedStatus)}`}>
                                {assignment.servedStatus === "SERVED" ? "Served" : "Missed"}
                              </span>
                            ) : null}
                          </div>
                          {shift.temporalStatus !== "PAST" ? (
                            <Button
                              type="button"
                              variant="secondary"
                              className="border-zinc-300"
                              disabled={Boolean(removingAssignmentId) || Boolean(assigningShiftId) || isPublishing || isSaving}
                              onClick={async () => {
                                setErrorMessage(null);
                                setRemovingAssignmentId(assignment.id);

                                try {
                                  const response = await fetch(`/api/shifts/${shift.id}/assignments/${assignment.id}`, {
                                    method: "DELETE",
                                  });

                                  if (!response.ok) {
                                    const body = await response.json().catch(() => null);
                                    setErrorMessage(
                                      typeof body?.details === "string"
                                        ? body.details
                                        : typeof body?.error === "string"
                                          ? body.error
                                          : "Could not remove assignment."
                                    );
                                    return;
                                  }

                                  await loadShifts(listLocationId, listWeekStartDate, listTimeRange);
                                } finally {
                                  setRemovingAssignmentId(null);
                                }
                              }}
                            >
                              {removingAssignmentId === assignment.id ? "Removing..." : "Remove"}
                            </Button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {shift.assignments.length < shift.headcount && shift.temporalStatus !== "PAST" ? (
                  <div className="flex items-end gap-2">
                    <div className="w-full space-y-1">
                      <label htmlFor={`assign-${shift.id}`} className="text-xs font-medium text-zinc-600">Assign staff</label>
                      <select
                        id={`assign-${shift.id}`}
                        className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
                        value={assignStaffByShift[shift.id] ?? ""}
                        disabled={Boolean(assigningShiftId) || Boolean(removingAssignmentId) || isPublishing || isSaving}
                        onChange={(event) =>
                          setAssignStaffByShift((current) => ({
                            ...current,
                            [shift.id]: event.target.value,
                          }))
                        }
                      >
                        <option value="">Select staff</option>
                        {locationStaff.map((person) => (
                          <option key={person.id} value={person.id}>
                            {person.name ?? "Unnamed"}{person.email ? ` (${person.email})` : ""}
                            {` • Skills: ${person.skills.map((entry) => skillNameById[entry.skillId]).filter(Boolean).join(", ") || "none"}`}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="w-full space-y-1">
                      <label htmlFor={`override-${shift.id}`} className="text-xs font-medium text-zinc-600">Override reason (if required)</label>
                      <Input
                        id={`override-${shift.id}`}
                        value={overrideReasonByShift[shift.id] ?? ""}
                        onChange={(event) =>
                          setOverrideReasonByShift((current) => ({
                            ...current,
                            [shift.id]: event.target.value,
                          }))
                        }
                        placeholder="Required for 7th consecutive day"
                      />
                    </div>
                    <Button
                      type="button"
                      onClick={async () => {
                        const selectedUserId = assignStaffByShift[shift.id];
                        const overrideReason = overrideReasonByShift[shift.id] ?? "";
                        if (!selectedUserId) {
                          setErrorMessage("Select a staff member first.");
                          return;
                        }

                        setErrorMessage(null);
                        setSuccessMessage(null);
                        setViolations([]);
                        setAlternatives([]);
                        setAssigningShiftId(shift.id);

                        try {
                          const response = await fetch(`/api/shifts/${shift.id}/assignments`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              userId: selectedUserId,
                              overrideReason,
                            }),
                          });

                          const body = await response.json().catch(() => null);

                          if (!response.ok) {
                            if (Array.isArray(body?.violations)) {
                              setViolations(body.violations);
                              setAlternatives(Array.isArray(body?.alternatives) ? body.alternatives : []);
                              return;
                            }

                            setErrorMessage(
                              typeof body?.details === "string"
                                ? body.details
                                : typeof body?.error === "string"
                                  ? body.error
                                  : "Could not assign staff member."
                            );
                            return;
                          }

                          setSuccessMessage("Staff member assigned successfully.");
                          await loadShifts(listLocationId, listWeekStartDate, listTimeRange);
                        } finally {
                          setAssigningShiftId(null);
                        }
                      }}
                      disabled={
                        Boolean(assigningShiftId)
                        || Boolean(removingAssignmentId)
                        || isPublishing
                        || isSaving
                        || !Boolean(assignStaffByShift[shift.id])
                      }
                    >
                      {assigningShiftId === shift.id ? "Assigning..." : "Assign"}
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
