"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/button";
import { InlineAlert } from "@/components/inline-alert";
import { RealtimeStatusIndicator } from "@/components/realtime-status-indicator";
import { formatDateTimeWithTimeZone } from "@/lib/date-time";
import { getRealtimeWebSocketUrl } from "@/lib/realtime-client";

type NotificationRow = {
  id: string;
  title: string;
  message: string;
  type?: string;
  readAt: string | null;
  createdAt: string;
};

type Preferences = {
  inAppEnabled: boolean;
  realtimeEnabled: boolean;
  emailEnabled: boolean;
};

export function NotificationCenter() {
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [simulatedEmailRecipient, setSimulatedEmailRecipient] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isMarkingAllRead, setIsMarkingAllRead] = useState(false);
  const [markingReadId, setMarkingReadId] = useState<string | null>(null);
  const [updatingPreferenceKey, setUpdatingPreferenceKey] = useState<keyof Preferences | null>(null);
  const [activeTab, setActiveTab] = useState<"unread" | "read">("unread");
  const [emailActiveTab, setEmailActiveTab] = useState<"unread" | "read">("unread");
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);

  const unreadRows = rows.filter((entry) => !entry.readAt);
  const readRows = rows.filter((entry) => Boolean(entry.readAt));
  const unreadEmailRows = unreadRows.slice(0, 20);
  const readEmailRows = readRows.slice(0, 20);

  async function loadData() {
    const [notificationsResponse, preferencesResponse] = await Promise.all([
      fetch("/api/notifications"),
      fetch("/api/notifications/preferences"),
    ]);

    const notificationsBody = await notificationsResponse.json().catch(() => null);
    const preferencesBody = await preferencesResponse.json().catch(() => null);

    if (!notificationsResponse.ok) {
      setErrorMessage(
        typeof notificationsBody?.error === "string"
          ? notificationsBody.error
          : "Could not load notifications."
      );
      return;
    }

    if (!preferencesResponse.ok) {
      setErrorMessage(
        typeof preferencesBody?.error === "string"
          ? preferencesBody.error
          : "Could not load notification preferences."
      );
      return;
    }

    setRows(Array.isArray(notificationsBody?.data) ? notificationsBody.data : []);
    setUnreadCount(typeof notificationsBody?.unreadCount === "number" ? notificationsBody.unreadCount : 0);
    setSimulatedEmailRecipient(
      typeof notificationsBody?.simulatedEmailRecipient === "string"
        ? notificationsBody.simulatedEmailRecipient
        : null
    );
    setPreferences(preferencesBody?.data ?? null);
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadData();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void loadData();
    }, 15_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    const wsUrl = getRealtimeWebSocketUrl();
    if (!wsUrl || typeof WebSocket === "undefined") {
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

        if (parsed.type === "notifications.updated" || parsed.type === "swap.updated") {
          void loadData();
        }
      } catch {
        return;
      }
    };

    return () => {
      socket.close();
    };
  }, []);

  async function markRead(notificationId: string) {
    setErrorMessage(null);
    setMarkingReadId(notificationId);
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationId }),
      });

      await loadData();
    } finally {
      setMarkingReadId(null);
    }
  }

  async function markAllRead() {
    setErrorMessage(null);
    setIsMarkingAllRead(true);
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAll: true }),
      });

      await loadData();
    } finally {
      setIsMarkingAllRead(false);
    }
  }

  async function updatePreference(value: boolean) {
    const key: keyof Preferences = "emailEnabled";
    setUpdatingPreferenceKey(key);
    try {
      const response = await fetch("/api/notifications/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      });

      const body = await response.json().catch(() => null);

      if (!response.ok) {
        setErrorMessage(typeof body?.error === "string" ? body.error : "Could not update preferences.");
        return;
      }

      setPreferences(body?.data ?? null);
    } finally {
      setUpdatingPreferenceKey(null);
    }
  }

  return (
    <div className="space-y-5">
      {errorMessage ? <InlineAlert variant="error">{errorMessage}</InlineAlert> : null}

      <section className="space-y-3 rounded-md border border-zinc-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-zinc-900">Notifications ({unreadCount} unread)</h2>
          <RealtimeStatusIndicator isConnected={isRealtimeConnected} />
          <Button type="button" variant="secondary" onClick={markAllRead} disabled={isMarkingAllRead || Boolean(markingReadId) || Boolean(updatingPreferenceKey)}>
            {isMarkingAllRead ? "Marking..." : "Mark all read"}
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button type="button" variant={activeTab === "unread" ? "secondary" : "ghost"} onClick={() => setActiveTab("unread")}>
            Unread ({unreadRows.length})
          </Button>
          <Button type="button" variant={activeTab === "read" ? "secondary" : "ghost"} onClick={() => setActiveTab("read")}>
            Read ({readRows.length})
          </Button>
        </div>

        {rows.length > 0 ? (
          <div className="space-y-2">
            {activeTab === "unread" ? (
              unreadRows.length === 0 ? <p className="text-sm text-zinc-600">No unread notifications.</p> : (
                <ul className="space-y-2">
                  {unreadRows.map((entry) => (
                    <li key={entry.id} className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
                      <p className="text-sm font-medium text-zinc-900">{entry.title}</p>
                      <p className="text-sm text-zinc-700">{entry.message}</p>
                      <p className="text-xs text-zinc-500">{formatDateTimeWithTimeZone(entry.createdAt)}</p>
                      <Button type="button" variant="ghost" onClick={() => markRead(entry.id)} disabled={isMarkingAllRead || Boolean(markingReadId) || Boolean(updatingPreferenceKey)}>
                        {markingReadId === entry.id ? "Marking..." : "Mark read"}
                      </Button>
                    </li>
                  ))}
                </ul>
              )
            ) : (
              readRows.length === 0 ? <p className="text-sm text-zinc-600">No read notifications yet.</p> : (
                <ul className="space-y-2">
                  {readRows.map((entry) => (
                    <li key={entry.id} className="rounded-md border border-zinc-200 bg-white p-3">
                      <p className="text-sm font-medium text-zinc-900">{entry.title}</p>
                      <p className="text-sm text-zinc-700">{entry.message}</p>
                      <p className="text-xs text-zinc-500">{formatDateTimeWithTimeZone(entry.createdAt)}</p>
                    </li>
                  ))}
                </ul>
              )
            )}
          </div>
        ) : (
          <p className="text-sm text-zinc-600">No notifications yet.</p>
        )}
      </section>

      <section className="space-y-3 rounded-md border border-zinc-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-zinc-900">Simulated email delivery</h2>
          <RealtimeStatusIndicator isConnected={isRealtimeConnected} />
        </div>
        <p className="text-xs text-zinc-500">
          {preferences?.emailEnabled
            ? `Email simulation is enabled${simulatedEmailRecipient ? ` for ${simulatedEmailRecipient}` : ""}.`
            : "Email simulation is currently disabled. Enable Email notifications below to simulate deliveries."}
        </p>

        {preferences?.emailEnabled ? (
          rows.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Button type="button" variant={emailActiveTab === "unread" ? "secondary" : "ghost"} onClick={() => setEmailActiveTab("unread")}>
                  Unread ({unreadRows.length})
                </Button>
                <Button type="button" variant={emailActiveTab === "read" ? "secondary" : "ghost"} onClick={() => setEmailActiveTab("read")}>
                  Read ({readRows.length})
                </Button>
              </div>

              {emailActiveTab === "unread" ? (
                unreadEmailRows.length === 0 ? <p className="text-sm text-zinc-600">No unread simulated emails.</p> : (
                  <ul className="space-y-2">
                    {unreadEmailRows.map((entry) => (
                      <li key={`email-unread-${entry.id}`} className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
                        <p className="text-xs text-zinc-500">To: {simulatedEmailRecipient ?? "(no recipient email)"}</p>
                        <p className="text-sm font-medium text-zinc-900">Subject: {entry.title}</p>
                        <p className="text-sm text-zinc-700">{entry.message}</p>
                        <p className="text-xs text-zinc-500">Queued: {formatDateTimeWithTimeZone(entry.createdAt)}</p>
                      </li>
                    ))}
                  </ul>
                )
              ) : (
                readEmailRows.length === 0 ? <p className="text-sm text-zinc-600">No read simulated emails.</p> : (
                  <ul className="space-y-2">
                    {readEmailRows.map((entry) => (
                      <li key={`email-read-${entry.id}`} className="rounded-md border border-zinc-200 bg-white p-3">
                        <p className="text-xs text-zinc-500">To: {simulatedEmailRecipient ?? "(no recipient email)"}</p>
                        <p className="text-sm font-medium text-zinc-900">Subject: {entry.title}</p>
                        <p className="text-sm text-zinc-700">{entry.message}</p>
                        <p className="text-xs text-zinc-500">Queued: {formatDateTimeWithTimeZone(entry.createdAt)}</p>
                      </li>
                    ))}
                  </ul>
                )
              )}
            </div>
          ) : (
            <p className="text-sm text-zinc-600">No simulated emails yet.</p>
          )
        ) : null}
      </section>

      <section className="space-y-3 rounded-md border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-zinc-900">Notification preferences</h2>

        {preferences ? (
          <div className="space-y-2 text-sm text-zinc-700">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={preferences.inAppEnabled} disabled readOnly />
              In-app notifications (always on)
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={preferences.realtimeEnabled} disabled readOnly />
              Real-time updates (always on)
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={preferences.emailEnabled} disabled={Boolean(updatingPreferenceKey)} onChange={(event) => void updatePreference(event.target.checked)} />
              Email notifications
            </label>
          </div>
        ) : (
          <p className="text-sm text-zinc-600">Loading preferences...</p>
        )}
      </section>
    </div>
  );
}
