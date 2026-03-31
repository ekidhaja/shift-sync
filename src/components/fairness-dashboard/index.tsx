"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/button";
import { InlineAlert } from "@/components/inline-alert";
import { RealtimeStatusIndicator } from "@/components/realtime-status-indicator";
import { formatDateRangeWithTimeZone, formatDateTimeWithTimeZone } from "@/lib/date-time";
import { getRealtimeWebSocketUrl } from "@/lib/realtime-client";

type FairnessRow = {
  userId: string;
  name: string | null;
  email: string | null;
  desiredWeeklyHours: number;
  assignedHours: number;
  variance: number;
  premiumShiftCount: number;
  fairnessScore: number;
};

type OnDutyRow = {
  id: string;
  clockInAt?: string | null;
  user: { name: string | null; email: string | null };
  shift: {
    startDateTime: string;
    endDateTime: string;
    location: { name: string; timezone: string };
  };
};

type LocationOption = {
  id: string;
  name: string;
  timezone: string;
};

export function FairnessDashboard() {
  const [locationId, setLocationId] = useState("");
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [rows, setRows] = useState<FairnessRow[]>([]);
  const [onDutyRows, setOnDutyRows] = useState<OnDutyRow[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoadingFairness, setIsLoadingFairness] = useState(false);
  const [isLoadingOnDuty, setIsLoadingOnDuty] = useState(false);
  const [isLoadingOptions, setIsLoadingOptions] = useState(false);
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);

  useEffect(() => {
    async function loadLocationOptions() {
      setIsLoadingOptions(true);
      setErrorMessage(null);

      try {
        const response = await fetch("/api/shifts/options");
        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          setErrorMessage(typeof payload?.error === "string" ? payload.error : "Could not load location options.");
          return;
        }

        const nextLocations = Array.isArray(payload?.data?.locations) ? payload.data.locations as LocationOption[] : [];
        setLocations(nextLocations);
      } finally {
        setIsLoadingOptions(false);
      }
    }

    void loadLocationOptions();
  }, []);

  const loadFairness = useCallback(async () => {
    setErrorMessage(null);
    setIsLoadingFairness(true);
    const query = new URLSearchParams();
    if (locationId) {
      query.set("locationId", locationId);
    }

    try {
      const response = await fetch(`/api/fairness/summary?${query.toString()}`);
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setErrorMessage(typeof payload?.error === "string" ? payload.error : "Could not load fairness summary.");
        return;
      }

      setRows(Array.isArray(payload?.data?.rows) ? payload.data.rows : []);
    } finally {
      setIsLoadingFairness(false);
    }
  }, [locationId]);

  const loadOnDuty = useCallback(async () => {
    setErrorMessage(null);
    setIsLoadingOnDuty(true);
    const query = new URLSearchParams();
    if (locationId) {
      query.set("locationId", locationId);
    }

    try {
      const response = await fetch(`/api/on-duty?${query.toString()}`);
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setErrorMessage(typeof payload?.error === "string" ? payload.error : "Could not load on-duty view.");
        return;
      }

      setOnDutyRows(Array.isArray(payload?.data) ? payload.data : []);
    } finally {
      setIsLoadingOnDuty(false);
    }
  }, [locationId]);

  useEffect(() => {
    void loadOnDuty();
  }, [loadOnDuty]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void loadOnDuty();
    }, 30_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [loadOnDuty]);

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
          void loadFairness();
          void loadOnDuty();
        }
      } catch {
        return;
      }
    };

    return () => {
      socket.close();
    };
  }, [loadFairness, loadOnDuty]);

  return (
    <div className="space-y-5">
      {errorMessage ? <InlineAlert variant="error">{errorMessage}</InlineAlert> : null}

      <section className="space-y-3 rounded-md border border-zinc-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-zinc-900">Fairness analytics</h2>
          <RealtimeStatusIndicator isConnected={isRealtimeConnected} />
        </div>
        <div className="space-y-2">
          <label htmlFor="fairness-location-id" className="text-sm font-medium text-zinc-700">Location (optional)</label>
          <select
            id="fairness-location-id"
            className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
            value={locationId}
            onChange={(event) => setLocationId(event.target.value)}
            disabled={isLoadingOptions || isLoadingFairness || isLoadingOnDuty}
          >
            <option value="">All accessible locations</option>
            {locations.map((entry) => (
              <option key={entry.id} value={entry.id}>{entry.name}</option>
            ))}
          </select>
        </div>
        <Button type="button" onClick={loadFairness} disabled={isLoadingFairness || isLoadingOnDuty}>
          {isLoadingFairness ? "Loading..." : "Load fairness score"}
        </Button>

        {rows.length > 0 ? (
          <ul className="space-y-2 text-sm text-zinc-700">
            {rows.map((row) => (
              <li key={row.userId} className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2">
                <p className="font-medium text-zinc-900">{row.name ?? "Unnamed"} {row.email ? `(${row.email})` : ""}</p>
                <p>Assigned: {row.assignedHours.toFixed(1)}h · Desired: {row.desiredWeeklyHours}h · Variance: {row.variance.toFixed(1)}h</p>
                <p>Premium shifts: {row.premiumShiftCount} · Fairness score: {row.fairnessScore.toFixed(1)}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-600">No fairness rows loaded yet.</p>
        )}
      </section>

      <section className="space-y-3 rounded-md border border-zinc-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-zinc-900">On-duty live dashboard</h2>
          <RealtimeStatusIndicator isConnected={isRealtimeConnected} />
        </div>
        <Button type="button" variant="secondary" onClick={loadOnDuty} disabled={isLoadingOnDuty || isLoadingFairness}>
          {isLoadingOnDuty ? "Loading..." : "Refresh on-duty"}
        </Button>

        {onDutyRows.length > 0 ? (
          <ul className="space-y-2 text-sm text-zinc-700">
            {onDutyRows.map((entry) => (
              <li key={entry.id} className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2">
                <p className="font-medium text-zinc-900">{entry.user.name ?? "Unnamed"} {entry.user.email ? `(${entry.user.email})` : ""}</p>
                <p>{entry.shift.location.name}</p>
                <p>{formatDateRangeWithTimeZone(entry.shift.startDateTime, entry.shift.endDateTime, entry.shift.location.timezone)}</p>
                <p className="text-xs text-emerald-700">
                  {entry.clockInAt
                    ? `Clocked in: ${formatDateTimeWithTimeZone(entry.clockInAt, entry.shift.location.timezone)}`
                    : "Clocked in"}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-600">No active assignments currently.</p>
        )}
      </section>
    </div>
  );
}
