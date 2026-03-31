"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { InlineAlert } from "@/components/inline-alert";
import { RealtimeStatusIndicator } from "@/components/realtime-status-indicator";
import { formatDateRangeWithTimeZone } from "@/lib/date-time";
import { getRealtimeWebSocketUrl } from "@/lib/realtime-client";

type ManagedAvailabilityEntry = {
  id: string;
  type: "RECURRING" | "EXCEPTION";
  dayOfWeek: number | null;
  startMinute: number | null;
  endMinute: number | null;
  startDateTime: string | null;
  endDateTime: string | null;
  userId: string;
  userName: string | null;
  userEmail: string | null;
  locationId: string;
  locationName: string;
  locationTimezone: string;
};

type ManagedFilterLocation = {
  id: string;
  name: string;
};

type ManagedFilterUser = {
  id: string;
  name: string | null;
  email: string | null;
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

function formatMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60)
    .toString()
    .padStart(2, "0");
  const remainder = (minutes % 60).toString().padStart(2, "0");
  return `${hours}:${remainder}`;
}

function formatAvailability(entry: ManagedAvailabilityEntry) {
  if (
    entry.type === "RECURRING"
    && entry.dayOfWeek !== null
    && entry.startMinute !== null
    && entry.endMinute !== null
  ) {
    return `${dayNames[entry.dayOfWeek]} • ${formatMinutes(entry.startMinute)}-${formatMinutes(entry.endMinute)}`;
  }

  if (entry.startDateTime && entry.endDateTime) {
    return formatDateRangeWithTimeZone(entry.startDateTime, entry.endDateTime, entry.locationTimezone);
  }

  return "Unknown availability";
}

function getRecurringDaySortValue(dayOfWeek: number | null) {
  if (dayOfWeek === null) {
    return Number.MAX_SAFE_INTEGER;
  }

  return dayOfWeek === 0 ? 6 : dayOfWeek - 1;
}

function sortAvailabilityEntries(left: ManagedAvailabilityEntry, right: ManagedAvailabilityEntry) {
  if (left.type === "RECURRING" && right.type === "RECURRING") {
    const dayDiff = getRecurringDaySortValue(left.dayOfWeek) - getRecurringDaySortValue(right.dayOfWeek);
    if (dayDiff !== 0) {
      return dayDiff;
    }

    const minuteDiff = (left.startMinute ?? 0) - (right.startMinute ?? 0);
    if (minuteDiff !== 0) {
      return minuteDiff;
    }

    return (left.userName ?? left.userEmail ?? "").localeCompare(right.userName ?? right.userEmail ?? "");
  }

  if (left.type === "RECURRING") {
    return -1;
  }

  if (right.type === "RECURRING") {
    return 1;
  }

  return (left.startDateTime ?? "").localeCompare(right.startDateTime ?? "");
}

export function ManagerAvailabilityTimeline() {
  const [entries, setEntries] = useState<ManagedAvailabilityEntry[]>([]);
  const [locationOptions, setLocationOptions] = useState<ManagedFilterLocation[]>([]);
  const [userOptions, setUserOptions] = useState<ManagedFilterUser[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);

  const loadEntries = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const query = new URLSearchParams();
      if (selectedLocationId) {
        query.set("locationId", selectedLocationId);
      }
      if (selectedUserId) {
        query.set("userId", selectedUserId);
      }

      const response = await fetch(`/api/availability/managed?${query.toString()}`, { method: "GET" });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setErrorMessage(
          typeof body?.error === "string"
            ? body.error
            : "Could not load managed availability."
        );
        return;
      }

      const body = await response.json();
      setEntries(Array.isArray(body?.data) ? body.data : []);

      const nextLocations = Array.isArray(body?.filters?.locations)
        ? body.filters.locations as ManagedFilterLocation[]
        : [];
      const nextUsers = Array.isArray(body?.filters?.users)
        ? body.filters.users as ManagedFilterUser[]
        : [];

      setLocationOptions(nextLocations);
      setUserOptions(nextUsers);

      if (selectedLocationId && !nextLocations.some((entry) => entry.id === selectedLocationId)) {
        setSelectedLocationId("");
      }
      if (selectedUserId && !nextUsers.some((entry) => entry.id === selectedUserId)) {
        setSelectedUserId("");
      }
    } catch {
      setErrorMessage("Could not load managed availability.");
    } finally {
      setIsLoading(false);
    }
  }, [selectedLocationId, selectedUserId]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

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

        if (parsed.type === "availability.updated") {
          void loadEntries();
        }
      } catch {
        return;
      }
    };

    return () => {
      socket.close();
    };
  }, [loadEntries]);

  const groupedEntries = useMemo(() => {
    const sortedEntries = [...entries].sort(sortAvailabilityEntries);

    return sortedEntries.reduce<Record<string, ManagedAvailabilityEntry[]>>((accumulator, entry) => {
      const key = `${entry.locationName} (${entry.locationTimezone})`;
      if (!accumulator[key]) {
        accumulator[key] = [];
      }
      accumulator[key].push(entry);
      return accumulator;
    }, {});
  }, [entries]);

  if (isLoading) {
    return <p className="text-sm text-zinc-600">Loading managed availability...</p>;
  }

  if (errorMessage) {
    return <InlineAlert variant="error">{errorMessage}</InlineAlert>;
  }

  const groups = Object.entries(groupedEntries);

  if (groups.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex justify-end">
          <RealtimeStatusIndicator isConnected={isRealtimeConnected} />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor="managed-availability-location" className="text-sm font-medium text-zinc-700">
              Filter by location
            </label>
            <select
              id="managed-availability-location"
              className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
              value={selectedLocationId}
              onChange={(event) => setSelectedLocationId(event.target.value)}
            >
              <option value="">All locations</option>
              {locationOptions.map((locationOption) => (
                <option key={locationOption.id} value={locationOption.id}>
                  {locationOption.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label htmlFor="managed-availability-user" className="text-sm font-medium text-zinc-700">
              Filter by staff
            </label>
            <select
              id="managed-availability-user"
              className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
              value={selectedUserId}
              onChange={(event) => setSelectedUserId(event.target.value)}
            >
              <option value="">All staff</option>
              {userOptions.map((userOption) => (
                <option key={userOption.id} value={userOption.id}>
                  {userOption.name ?? "Unnamed staff"}
                  {userOption.email ? ` (${userOption.email})` : ""}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="text-sm text-zinc-600">No staff availability found for the selected filters.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <RealtimeStatusIndicator isConnected={isRealtimeConnected} />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="managed-availability-location" className="text-sm font-medium text-zinc-700">
            Filter by location
          </label>
          <select
            id="managed-availability-location"
            className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
            value={selectedLocationId}
            onChange={(event) => setSelectedLocationId(event.target.value)}
          >
            <option value="">All locations</option>
            {locationOptions.map((locationOption) => (
              <option key={locationOption.id} value={locationOption.id}>
                {locationOption.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <label htmlFor="managed-availability-user" className="text-sm font-medium text-zinc-700">
            Filter by staff
          </label>
          <select
            id="managed-availability-user"
            className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
            value={selectedUserId}
            onChange={(event) => setSelectedUserId(event.target.value)}
          >
            <option value="">All staff</option>
            {userOptions.map((userOption) => (
              <option key={userOption.id} value={userOption.id}>
                {userOption.name ?? "Unnamed staff"}
                {userOption.email ? ` (${userOption.email})` : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      {groups.map(([locationLabel, locationEntries]) => (
        <section key={locationLabel} className="space-y-2 rounded-md border border-zinc-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-zinc-900">{locationLabel}</h2>
          <ul className="space-y-2">
            {locationEntries.map((entry) => (
              <li key={entry.id} className="rounded-md border border-zinc-100 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
                <p className="font-medium text-zinc-900">
                  {entry.userName ?? "Unnamed staff"}
                  {entry.userEmail ? ` (${entry.userEmail})` : ""}
                </p>
                <p>{formatAvailability(entry)}</p>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
