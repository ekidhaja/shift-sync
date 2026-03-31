"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/button";
import { InlineAlert } from "@/components/inline-alert";
import { RealtimeStatusIndicator } from "@/components/realtime-status-indicator";
import { formatDateRangeWithTimeZone, formatDateTimeWithTimeZone } from "@/lib/date-time";
import { getRealtimeWebSocketUrl } from "@/lib/realtime-client";

type StaffShift = {
  id: string;
  startDateTime: string;
  endDateTime: string;
  status: "DRAFT" | "PUBLISHED";
  temporalStatus?: "PAST" | "UPCOMING";
  myAssignmentId?: string | null;
  clockInAt?: string | null;
  clockOutAt?: string | null;
  location: { name: string; timezone: string };
  requiredSkill: { name: string };
};

type AvailableShift = {
  id: string;
  startDateTime: string;
  endDateTime: string;
  status: "DRAFT" | "PUBLISHED";
  temporalStatus?: "PAST" | "UPCOMING";
  openSpots: number;
  location: { name: string; timezone: string };
  requiredSkill: { name: string };
};

export function StaffSchedule() {
  const [shifts, setShifts] = useState<StaffShift[]>([]);
  const [availableShifts, setAvailableShifts] = useState<AvailableShift[]>([]);
  const [timeRange, setTimeRange] = useState<"upcoming" | "past">("upcoming");
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingAvailable, setIsLoadingAvailable] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);
  const [isClockingShiftId, setIsClockingShiftId] = useState<string | null>(null);
  const [isPickingUpShiftId, setIsPickingUpShiftId] = useState<string | null>(null);

  const loadShifts = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const query = new URLSearchParams({
        timeRange,
      });

      const response = await fetch(`/api/shifts?${query.toString()}`);
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setErrorMessage(typeof payload?.error === "string" ? payload.error : "Could not load schedule.");
        return;
      }

      setShifts(Array.isArray(payload?.data) ? payload.data : []);
    } catch {
      setErrorMessage("Could not load schedule.");
    } finally {
      setIsLoading(false);
    }
  }, [timeRange]);

  const loadAvailableShifts = useCallback(async () => {
    if (timeRange !== "upcoming") {
      setAvailableShifts([]);
      return;
    }

    setIsLoadingAvailable(true);

    try {
      const response = await fetch("/api/shifts/available");
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setErrorMessage(typeof payload?.error === "string" ? payload.error : "Could not load available shifts.");
        return;
      }

      setAvailableShifts(Array.isArray(payload?.data) ? payload.data : []);
    } catch {
      setErrorMessage("Could not load available shifts.");
    } finally {
      setIsLoadingAvailable(false);
    }
  }, [timeRange]);

  useEffect(() => {
    void loadShifts();
  }, [loadShifts]);

  useEffect(() => {
    void loadAvailableShifts();
  }, [loadAvailableShifts]);

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
        const parsed = JSON.parse(event.data) as { type?: string };

        if (parsed.type === "schedule.updated" || parsed.type === "swap.updated") {
          void loadShifts();
          void loadAvailableShifts();
        }
      } catch {
        return;
      }
    };

    return () => {
      socket.close();
    };
  }, [loadAvailableShifts, loadShifts]);

  if (isLoading) {
    return <p className="text-sm text-zinc-600">Loading your schedule...</p>;
  }

  const now = new Date();

  const timingPillClass = (timing: "PAST" | "UPCOMING" | undefined) => (
    timing === "PAST"
      ? "bg-amber-100 text-amber-800 border-amber-200"
      : "bg-blue-100 text-blue-800 border-blue-200"
  );

  const outcomePillClass = (served: boolean) => (
    served
      ? "bg-emerald-100 text-emerald-800 border-emerald-200"
      : "bg-rose-100 text-rose-800 border-rose-200"
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 rounded-md border border-zinc-200 bg-white px-3 py-2">
        <p className="text-sm font-semibold text-zinc-900">My schedule</p>
        <div className="flex items-center gap-2">
          <RealtimeStatusIndicator isConnected={isRealtimeConnected} />
          <label htmlFor="staff-schedule-range" className="text-xs font-medium text-zinc-600">View</label>
          <select
            id="staff-schedule-range"
            className="h-9 w-44 rounded-md border border-zinc-200 bg-white px-2.5 text-sm text-zinc-900"
            value={timeRange}
            onChange={(event) => setTimeRange(event.target.value as "upcoming" | "past")}
            disabled={isLoading || Boolean(isClockingShiftId)}
          >
            <option value="upcoming">Upcoming shifts</option>
            <option value="past">Past shifts</option>
          </select>
        </div>
      </div>

      {errorMessage ? <InlineAlert variant="error">{errorMessage}</InlineAlert> : null}

      {shifts.length > 0 ? (
        <ul className="space-y-2">
          {shifts.map((shift) => (
            <li key={shift.id} className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2">
              <p className="text-sm font-semibold text-zinc-900">
                {shift.location.name} · {shift.requiredSkill.name}
              </p>
              <p className="text-sm text-zinc-600">
                {formatDateRangeWithTimeZone(shift.startDateTime, shift.endDateTime, shift.location.timezone)}
              </p>
              <div className="mt-1 flex flex-wrap gap-2">
                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${timingPillClass(shift.temporalStatus)}`}>
                  {shift.temporalStatus ?? "UPCOMING"}
                </span>
                {shift.clockInAt && !shift.clockOutAt ? (
                  <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                    ON DUTY
                  </span>
                ) : null}
                {shift.clockOutAt ? (
                  <span className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700">
                    CLOCKED OUT
                  </span>
                ) : null}
              </div>
              {shift.temporalStatus === "PAST" ? (
                <div className="mt-1">
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${outcomePillClass(Boolean(shift.clockInAt))}`}>
                    {shift.clockInAt ? "Served" : "Missed"}
                  </span>
                </div>
              ) : null}
              {shift.clockInAt && !shift.clockOutAt ? (
                <p className="text-xs text-emerald-700">
                  Clocked in at {formatDateTimeWithTimeZone(shift.clockInAt, shift.location.timezone)}
                </p>
              ) : null}
              {shift.clockOutAt ? (
                <p className="text-xs text-zinc-500">
                  Clocked out at {formatDateTimeWithTimeZone(shift.clockOutAt, shift.location.timezone)}
                </p>
              ) : null}

              {shift.myAssignmentId && shift.status === "PUBLISHED" && shift.temporalStatus !== "PAST" ? (
                <div className="mt-2 flex gap-2">
                  {!shift.clockInAt || shift.clockOutAt ? (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={
                        Boolean(isClockingShiftId)
                        || now > new Date(shift.endDateTime)
                      }
                      onClick={async () => {
                        setErrorMessage(null);
                        setIsClockingShiftId(shift.id);

                        try {
                          const response = await fetch(`/api/shifts/${shift.id}/clock`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ action: "clockIn" }),
                          });

                          const payload = await response.json().catch(() => null);

                          if (!response.ok) {
                            setErrorMessage(typeof payload?.error === "string" ? payload.error : "Could not clock in.");
                            return;
                          }

                          await loadShifts();
                        } finally {
                          setIsClockingShiftId(null);
                        }
                      }}
                    >
                      {isClockingShiftId === shift.id ? "Clocking in..." : "Clock in"}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="secondary"
                      className="border-zinc-300"
                      disabled={Boolean(isClockingShiftId)}
                      onClick={async () => {
                        setErrorMessage(null);
                        setIsClockingShiftId(shift.id);

                        try {
                          const response = await fetch(`/api/shifts/${shift.id}/clock`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ action: "clockOut" }),
                          });

                          const payload = await response.json().catch(() => null);

                          if (!response.ok) {
                            setErrorMessage(typeof payload?.error === "string" ? payload.error : "Could not clock out.");
                            return;
                          }

                          await loadShifts();
                        } finally {
                          setIsClockingShiftId(null);
                        }
                      }}
                    >
                      {isClockingShiftId === shift.id ? "Clocking out..." : "Clock out"}
                    </Button>
                  )}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-zinc-600">No {timeRange} published shifts assigned.</p>
      )}

      {timeRange === "upcoming" ? (
        <section className="space-y-2 rounded-md border border-zinc-200 bg-white p-3">
          <h2 className="text-sm font-semibold text-zinc-900">Available shifts</h2>
          {isLoadingAvailable ? (
            <p className="text-sm text-zinc-600">Loading available shifts...</p>
          ) : availableShifts.length === 0 ? (
            <p className="text-sm text-zinc-600">No claimable open shifts right now.</p>
          ) : (
            <ul className="space-y-2">
              {availableShifts.map((shift) => (
                <li key={shift.id} className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2">
                  <p className="text-sm font-semibold text-zinc-900">
                    {shift.location.name} · {shift.requiredSkill.name}
                  </p>
                  <p className="text-sm text-zinc-600">
                    {formatDateRangeWithTimeZone(shift.startDateTime, shift.endDateTime, shift.location.timezone)}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                      OPEN SPOTS: {shift.openSpots}
                    </span>
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${timingPillClass(shift.temporalStatus)}`}>
                      {shift.temporalStatus ?? "UPCOMING"}
                    </span>
                  </div>
                  <div className="mt-2">
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={Boolean(isPickingUpShiftId) || Boolean(isClockingShiftId)}
                      onClick={async () => {
                        setErrorMessage(null);
                        setIsPickingUpShiftId(shift.id);

                        try {
                          const response = await fetch(`/api/shifts/${shift.id}/claim`, {
                            method: "POST",
                          });

                          const payload = await response.json().catch(() => null);

                          if (!response.ok) {
                            setErrorMessage(
                              typeof payload?.details === "string"
                                ? payload.details
                                : typeof payload?.error === "string"
                                  ? payload.error
                                  : "Could not pick up shift."
                            );
                            return;
                          }

                          await loadShifts();
                          await loadAvailableShifts();
                        } finally {
                          setIsPickingUpShiftId(null);
                        }
                      }}
                    >
                      {isPickingUpShiftId === shift.id ? "Claiming..." : "Pick up shift"}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}
