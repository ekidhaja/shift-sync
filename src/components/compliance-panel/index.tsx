"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/button";
import { InlineAlert } from "@/components/inline-alert";
import { formatDateRangeWithTimeZone } from "@/lib/date-time";

type ComplianceIssue = {
  code: string;
  severity: "warning" | "block" | "requires_override";
  message: string;
};

type CompliancePreview = {
  projectedWeeklyHours: number;
  projectedDailyHours: number;
  projectedConsecutiveDays: number;
  issues: ComplianceIssue[];
};

type OvertimeRiskRow = {
  userId: string;
  name: string | null;
  email: string | null;
  totalHours: number;
};

type ComplianceLocationOption = {
  id: string;
  name: string;
  timezone: string;
};

type ComplianceStaffOption = {
  id: string;
  name: string | null;
  email: string | null;
  certifications: Array<{ locationId: string }>;
};

type ComplianceShiftOption = {
  id: string;
  locationId: string;
  startDateTime: string;
  endDateTime: string;
  location: {
    id: string;
    name: string;
    timezone: string;
  };
};

function formatPersonLabel(entry: { name: string | null; email: string | null }) {
  return entry.name ? `${entry.name}${entry.email ? ` (${entry.email})` : ""}` : (entry.email ?? "Unnamed staff");
}

function formatShiftLabel(entry: ComplianceShiftOption) {
  return `${entry.location.name} · ${formatDateRangeWithTimeZone(entry.startDateTime, entry.endDateTime, entry.location.timezone)}`;
}

export function CompliancePanel() {
  const [userId, setUserId] = useState("");
  const [shiftId, setShiftId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [locations, setLocations] = useState<ComplianceLocationOption[]>([]);
  const [staffOptions, setStaffOptions] = useState<ComplianceStaffOption[]>([]);
  const [shiftOptions, setShiftOptions] = useState<ComplianceShiftOption[]>([]);
  const [isLoadingOptions, setIsLoadingOptions] = useState(false);

  const [preview, setPreview] = useState<CompliancePreview | null>(null);
  const [overtimeRisk, setOvertimeRisk] = useState<OvertimeRiskRow[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRunningWhatIf, setIsRunningWhatIf] = useState(false);
  const [isLoadingRisk, setIsLoadingRisk] = useState(false);

  const visibleShiftOptions = useMemo(
    () => (locationId ? shiftOptions.filter((entry) => entry.locationId === locationId) : shiftOptions),
    [locationId, shiftOptions]
  );

  const visibleStaffOptions = useMemo(
    () => (locationId
      ? staffOptions.filter((entry) => entry.certifications.some((certification) => certification.locationId === locationId))
      : staffOptions),
    [locationId, staffOptions]
  );

  useEffect(() => {
    async function loadOptions() {
      setIsLoadingOptions(true);
      setErrorMessage(null);

      try {
        const response = await fetch("/api/compliance/options");
        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          setErrorMessage(typeof payload?.error === "string" ? payload.error : "Could not load compliance options.");
          return;
        }

        const nextLocations = Array.isArray(payload?.data?.locations) ? payload.data.locations as ComplianceLocationOption[] : [];
        const nextStaff = Array.isArray(payload?.data?.staff) ? payload.data.staff as ComplianceStaffOption[] : [];
        const nextShifts = Array.isArray(payload?.data?.shifts) ? payload.data.shifts as ComplianceShiftOption[] : [];

        setLocations(nextLocations);
        setStaffOptions(nextStaff);
        setShiftOptions(nextShifts);
      } finally {
        setIsLoadingOptions(false);
      }
    }

    void loadOptions();
  }, []);

  useEffect(() => {
    if (shiftId && !visibleShiftOptions.some((entry) => entry.id === shiftId)) {
      setShiftId("");
    }
  }, [shiftId, visibleShiftOptions]);

  useEffect(() => {
    if (userId && !visibleStaffOptions.some((entry) => entry.id === userId)) {
      setUserId("");
    }
  }, [userId, visibleStaffOptions]);

  async function runWhatIf() {
    setErrorMessage(null);
    setIsRunningWhatIf(true);

    try {
      const response = await fetch("/api/compliance/what-if", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, shiftId }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setErrorMessage(typeof payload?.error === "string" ? payload.error : "Could not run what-if check.");
        return;
      }

      setPreview(payload?.data ?? null);
    } finally {
      setIsRunningWhatIf(false);
    }
  }

  async function loadOvertimeRisk() {
    setErrorMessage(null);
    setIsLoadingRisk(true);

    try {
      const query = new URLSearchParams();
      if (locationId) {
        query.set("locationId", locationId);
      }

      const response = await fetch(`/api/compliance/overtime?${query.toString()}`);
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setErrorMessage(typeof payload?.error === "string" ? payload.error : "Could not load overtime risk.");
        return;
      }

      setOvertimeRisk(Array.isArray(payload?.data?.overtimeRisk) ? payload.data.overtimeRisk : []);
    } finally {
      setIsLoadingRisk(false);
    }
  }

  return (
    <div className="space-y-5">
      {errorMessage ? <InlineAlert variant="error">{errorMessage}</InlineAlert> : null}

      <section className="space-y-3 rounded-md border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-zinc-900">What-if impact preview</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-2">
            <label htmlFor="compliance-location-id" className="text-sm font-medium text-zinc-700">Location (optional)</label>
            <select
              id="compliance-location-id"
              className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
              value={locationId}
              onChange={(event) => setLocationId(event.target.value)}
              disabled={isLoadingOptions || isRunningWhatIf || isLoadingRisk}
            >
              <option value="">All accessible locations</option>
              {locations.map((entry) => (
                <option key={entry.id} value={entry.id}>{entry.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="compliance-user-id" className="text-sm font-medium text-zinc-700">Staff member</label>
            <select
              id="compliance-user-id"
              className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
              value={userId}
              onChange={(event) => setUserId(event.target.value)}
              disabled={isLoadingOptions || isRunningWhatIf || isLoadingRisk || visibleStaffOptions.length === 0}
            >
              <option value="">Select staff member</option>
              {visibleStaffOptions.map((entry) => (
                <option key={entry.id} value={entry.id}>{formatPersonLabel(entry)}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="compliance-shift-id" className="text-sm font-medium text-zinc-700">Shift</label>
            <select
              id="compliance-shift-id"
              className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
              value={shiftId}
              onChange={(event) => setShiftId(event.target.value)}
              disabled={isLoadingOptions || isRunningWhatIf || isLoadingRisk || visibleShiftOptions.length === 0}
            >
              <option value="">Select shift</option>
              {visibleShiftOptions.map((entry) => (
                <option key={entry.id} value={entry.id}>{formatShiftLabel(entry)}</option>
              ))}
            </select>
          </div>
        </div>

        <Button type="button" onClick={runWhatIf} disabled={isRunningWhatIf || isLoadingOptions || !shiftId || !userId}>
          {isRunningWhatIf ? "Running..." : "Run what-if"}
        </Button>

        {preview ? (
          <div className="space-y-1 text-sm text-zinc-700">
            <p>Projected weekly hours: {preview.projectedWeeklyHours.toFixed(1)}</p>
            <p>Projected daily hours: {preview.projectedDailyHours.toFixed(1)}</p>
            <p>Projected consecutive days: {preview.projectedConsecutiveDays}</p>
            {preview.issues.length > 0 ? (
              <ul className="list-disc pl-5">
                {preview.issues.map((issue) => (
                  <li key={`${issue.code}-${issue.message}`}>{issue.severity.toUpperCase()}: {issue.message}</li>
                ))}
              </ul>
            ) : (
              <p>No compliance issues detected.</p>
            )}
          </div>
        ) : null}
      </section>

      <section className="space-y-3 rounded-md border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-zinc-900">Overtime risk dashboard</h2>
        <Button type="button" variant="secondary" onClick={loadOvertimeRisk} disabled={isLoadingRisk || isRunningWhatIf}>
          {isLoadingRisk ? "Loading..." : "Load risk"}
        </Button>

        {overtimeRisk.length > 0 ? (
          <ul className="space-y-2 text-sm text-zinc-700">
            {overtimeRisk.map((entry) => (
              <li key={entry.userId} className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2">
                {(entry.name ?? "Unnamed")} {entry.email ? `(${entry.email})` : ""} — {entry.totalHours.toFixed(1)}h
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-600">No overtime risk rows loaded.</p>
        )}
      </section>
    </div>
  );
}
