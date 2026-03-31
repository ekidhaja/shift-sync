"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/button";
import { InlineAlert } from "@/components/inline-alert";
import { RealtimeStatusIndicator } from "@/components/realtime-status-indicator";
import { formatDateRangeWithTimeZone, formatDateTimeWithTimeZone } from "@/lib/date-time";
import { getRealtimeWebSocketUrl } from "@/lib/realtime-client";

type UserRole = "ADMIN" | "MANAGER" | "STAFF";

type SwapRequest = {
  id: string;
  type: "SWAP" | "DROP";
  status: string;
  requesterId: string;
  targetUserId: string | null;
  shiftId: string;
  proposedShiftId: string | null;
  reason: string | null;
  createdAt: string;
  requester?: { id: string; name: string | null; email: string | null };
  manager?: { id: string; name: string | null; email: string | null } | null;
  targetUser?: { id: string; name: string | null; email: string | null } | null;
  shift?: ShiftOption;
  proposedShift?: ShiftOption | null;
};

type ShiftOption = {
  id: string;
  startDateTime: string;
  endDateTime: string;
  location: {
    id?: string;
    name: string;
    timezone: string;
  };
};

type PeerOption = {
  id: string;
  name: string | null;
  email: string | null;
  shifts: ShiftOption[];
};

type SwapCenterProps = {
  role: UserRole | string;
  userId: string;
};

function formatShiftLabel(shift: ShiftOption) {
  return `${shift.location.name} · ${formatDateRangeWithTimeZone(shift.startDateTime, shift.endDateTime, shift.location.timezone)}`;
}

function formatPersonLabel(person: { name: string | null; email: string | null }) {
  return person.name ? `${person.name}${person.email ? ` (${person.email})` : ""}` : (person.email ?? "Unnamed staff");
}

function statusPillClass(status: string) {
  const normalized = status.toUpperCase();

  if (normalized.includes("APPROVED")) {
    return "border-emerald-200 bg-emerald-100 text-emerald-800";
  }

  if (normalized.includes("REJECTED") || normalized.includes("CANCELED") || normalized.includes("EXPIRED")) {
    return "border-rose-200 bg-rose-100 text-rose-800";
  }

  if (normalized.includes("PENDING")) {
    return "border-amber-200 bg-amber-100 text-amber-800";
  }

  return "border-zinc-200 bg-zinc-100 text-zinc-700";
}

function prettifyStatus(status: string) {
  return status
    .toLowerCase()
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

export function SwapCenter({ role, userId }: SwapCenterProps) {
  const normalizedRole = String(role ?? "").trim().toUpperCase();
  const canCreate = normalizedRole === "STAFF";

  const [requests, setRequests] = useState<SwapRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [optionsLoadError, setOptionsLoadError] = useState<string | null>(null);

  const [type, setType] = useState<"SWAP" | "DROP">("DROP");
  const [shiftId, setShiftId] = useState("");
  const [targetUserId, setTargetUserId] = useState("");
  const [proposedShiftId, setProposedShiftId] = useState("");
  const [reason, setReason] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isLoadingOptions, setIsLoadingOptions] = useState(false);
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);
  const [myShifts, setMyShifts] = useState<ShiftOption[]>([]);
  const [peers, setPeers] = useState<PeerOption[]>([]);
  const [actingRequestId, setActingRequestId] = useState<string | null>(null);
  const [decisionRequestId, setDecisionRequestId] = useState<string | null>(null);

  const selectedPeer = peers.find((entry) => entry.id === targetUserId) ?? null;
  const proposedShiftOptions = selectedPeer?.shifts ?? [];

  async function loadRequests() {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/swaps");
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setErrorMessage(typeof payload?.error === "string" ? payload.error : "Could not load swap requests.");
        return;
      }

      setRequests(Array.isArray(payload?.data) ? payload.data : []);
    } catch {
      setErrorMessage("Could not load swap requests.");
    } finally {
      setIsLoading(false);
    }
  }

  async function loadSwapOptions() {
    if (!canCreate) {
      return;
    }

    setIsLoadingOptions(true);
    setOptionsLoadError(null);

    try {
      const response = await fetch("/api/swaps/options");
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setOptionsLoadError(typeof payload?.error === "string" ? payload.error : "Could not load swap options.");
        return;
      }

      const nextMyShifts = Array.isArray(payload?.data?.myShifts) ? payload.data.myShifts as ShiftOption[] : [];
      const nextPeers = Array.isArray(payload?.data?.peers) ? payload.data.peers as PeerOption[] : [];

      setMyShifts(nextMyShifts);
      setPeers(nextPeers);

      if (!shiftId && nextMyShifts.length > 0) {
        setShiftId(nextMyShifts[0].id);
      }
    } catch {
      setOptionsLoadError("Could not load swap options.");
    } finally {
      setIsLoadingOptions(false);
    }
  }

  useEffect(() => {
    void loadRequests();
    void loadSwapOptions();
  }, []);

  useEffect(() => {
    if (type === "DROP") {
      setTargetUserId("");
      setProposedShiftId("");
    }
  }, [type]);

  useEffect(() => {
    if (!targetUserId) {
      setProposedShiftId("");
      return;
    }

    if (proposedShiftOptions.some((entry) => entry.id === proposedShiftId)) {
      return;
    }

    setProposedShiftId("");
  }, [proposedShiftId, proposedShiftOptions, targetUserId]);

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

        if (parsed.type === "swap.updated") {
          void loadRequests();
        }
      } catch {
        return;
      }
    };

    return () => {
      socket.close();
    };
  }, []);

  async function handleCreate() {
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsCreating(true);

    try {
      const response = await fetch("/api/swaps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          shiftId,
          targetUserId: type === "SWAP" ? targetUserId : undefined,
          proposedShiftId: type === "SWAP" ? proposedShiftId : undefined,
          reason,
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setErrorMessage(
          typeof payload?.details === "string"
            ? payload.details
            : typeof payload?.error === "string"
              ? payload.error
              : "Could not create swap request."
        );
        return;
      }

      setSuccessMessage("Swap/drop request submitted.");
      setShiftId("");
      setTargetUserId("");
      setProposedShiftId("");
      setReason("");
      await loadRequests();
    } finally {
      setIsCreating(false);
    }
  }

  async function handleAction(id: string, action: "accept" | "cancel") {
    setErrorMessage(null);
    setSuccessMessage(null);
    setActingRequestId(id);

    try {
      const response = await fetch(`/api/swaps/${id}/${action}`, {
        method: "POST",
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setErrorMessage(
          typeof payload?.details === "string"
            ? payload.details
            : typeof payload?.error === "string"
              ? payload.error
              : "Could not update request."
        );
        return;
      }

      setSuccessMessage(action === "accept" ? "Swap accepted." : "Request canceled.");
      await loadRequests();
    } finally {
      setActingRequestId(null);
    }
  }

  async function handleDecision(id: string, approve: boolean) {
    setErrorMessage(null);
    setSuccessMessage(null);
    setDecisionRequestId(id);

    try {
      const response = await fetch(`/api/swaps/${id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approve }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setErrorMessage(
          typeof payload?.details === "string"
            ? payload.details
            : typeof payload?.error === "string"
              ? payload.error
              : "Could not decide request."
        );
        return;
      }

      setSuccessMessage(approve ? "Request approved." : "Request rejected.");
      await loadRequests();
    } finally {
      setDecisionRequestId(null);
    }
  }

  const isBusy = isCreating || isLoadingOptions || Boolean(actingRequestId) || Boolean(decisionRequestId);
  const isManualFallback = canCreate && Boolean(optionsLoadError);

  return (
    <div className="space-y-5">
      {errorMessage ? <InlineAlert variant="error">{errorMessage}</InlineAlert> : null}
      {successMessage ? <InlineAlert variant="success">{successMessage}</InlineAlert> : null}

      {canCreate ? (
        <section className="space-y-3 rounded-md border border-zinc-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-zinc-900">Create swap/drop request</h2>
            <RealtimeStatusIndicator isConnected={isRealtimeConnected} />
          </div>
          {isManualFallback ? (
            <InlineAlert variant="error">
              Swap options could not load. You can still submit using IDs below.
            </InlineAlert>
          ) : null}
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="swap-type" className="text-sm font-medium text-zinc-700">Request type</label>
              <select
                id="swap-type"
                className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
                value={type}
                onChange={(event) => setType(event.target.value as "SWAP" | "DROP")}
                disabled={isBusy}
              >
                <option value="DROP">Drop</option>
                <option value="SWAP">Swap</option>
              </select>
            </div>

            <div className="space-y-2">
              <label htmlFor="swap-shift-id" className="text-sm font-medium text-zinc-700">Your shift</label>
              {isManualFallback ? (
                <input
                  id="swap-shift-id"
                  value={shiftId}
                  onChange={(event) => setShiftId(event.target.value)}
                  placeholder="shift_cuid"
                  disabled={isBusy}
                  className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
                />
              ) : (
                <select
                  id="swap-shift-id"
                  className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
                  value={shiftId}
                  onChange={(event) => setShiftId(event.target.value)}
                  disabled={isBusy || myShifts.length === 0}
                >
                  {myShifts.length === 0 ? <option value="">No assigned shifts available</option> : null}
                  {myShifts.map((entry) => (
                    <option key={entry.id} value={entry.id}>{formatShiftLabel(entry)}</option>
                  ))}
                </select>
              )}
            </div>

            {type === "SWAP" ? (
              <>
                <div className="space-y-2">
                  <label htmlFor="swap-target-user" className="text-sm font-medium text-zinc-700">Target staff member</label>
                  {isManualFallback ? (
                    <input
                      id="swap-target-user"
                      value={targetUserId}
                      onChange={(event) => setTargetUserId(event.target.value)}
                      placeholder="user_cuid"
                      disabled={isBusy}
                      className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
                    />
                  ) : (
                    <select
                      id="swap-target-user"
                      className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
                      value={targetUserId}
                      onChange={(event) => setTargetUserId(event.target.value)}
                      disabled={isBusy || peers.length === 0}
                    >
                      <option value="">Select staff member</option>
                      {peers.map((entry) => (
                        <option key={entry.id} value={entry.id}>{formatPersonLabel(entry)}</option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="space-y-2">
                  <label htmlFor="swap-proposed-shift" className="text-sm font-medium text-zinc-700">Target shift</label>
                  {isManualFallback ? (
                    <input
                      id="swap-proposed-shift"
                      value={proposedShiftId}
                      onChange={(event) => setProposedShiftId(event.target.value)}
                      placeholder="shift_cuid"
                      disabled={isBusy}
                      className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
                    />
                  ) : (
                    <select
                      id="swap-proposed-shift"
                      className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
                      value={proposedShiftId}
                      onChange={(event) => setProposedShiftId(event.target.value)}
                      disabled={isBusy || !targetUserId || proposedShiftOptions.length === 0}
                    >
                      <option value="">Select target shift</option>
                      {proposedShiftOptions.map((entry) => (
                        <option key={entry.id} value={entry.id}>{formatShiftLabel(entry)}</option>
                      ))}
                    </select>
                  )}
                </div>
              </>
            ) : null}

            <div className="space-y-2 md:col-span-2">
              <label htmlFor="swap-reason" className="text-sm font-medium text-zinc-700">Reason (optional)</label>
              <input
                id="swap-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Optional details"
                disabled={isBusy}
                className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
              />
            </div>
          </div>

          <Button type="button" onClick={handleCreate} disabled={isBusy || !shiftId || (type === "SWAP" && (!targetUserId || !proposedShiftId))}>
            {isCreating ? "Submitting..." : "Submit request"}
          </Button>
        </section>
      ) : (
        <InlineAlert variant="success">Managers and admins can review and decide pending staff requests in the queue below.</InlineAlert>
      )}

      <section className="space-y-3 rounded-md border border-zinc-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-zinc-900">Request queue</h2>
          <RealtimeStatusIndicator isConnected={isRealtimeConnected} />
        </div>

        {isLoading ? (
          <p className="text-sm text-zinc-600">Loading requests...</p>
        ) : requests.length === 0 ? (
          <p className="text-sm text-zinc-600">No swap/drop requests yet.</p>
        ) : (
          <ul className="space-y-2">
            {requests.map((entry) => (
              <li key={entry.id} className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-zinc-900">{entry.type}</span>
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${statusPillClass(entry.status)}`}>
                    {prettifyStatus(entry.status)}
                  </span>
                </div>

                <div className="mt-2 grid gap-1 text-xs text-zinc-700 md:grid-cols-2">
                  <p>
                    <span className="font-semibold text-zinc-800">Shift:</span>{" "}
                    {entry.shift ? formatShiftLabel(entry.shift) : entry.shiftId}
                  </p>
                  <p>
                    <span className="font-semibold text-zinc-800">Requester:</span>{" "}
                    {entry.requester ? formatPersonLabel(entry.requester) : entry.requesterId}
                  </p>
                  <p>
                    <span className="font-semibold text-zinc-800">Target:</span>{" "}
                    {entry.targetUser ? formatPersonLabel(entry.targetUser) : (entry.targetUserId ?? "N/A")}
                  </p>
                  <p>
                    <span className="font-semibold text-zinc-800">Proposed shift:</span>{" "}
                    {entry.proposedShift
                      ? formatShiftLabel(entry.proposedShift)
                      : entry.proposedShiftId ?? "N/A"}
                  </p>
                  <p>
                    <span className="font-semibold text-zinc-800">Requested:</span>{" "}
                    {formatDateTimeWithTimeZone(
                      entry.createdAt,
                      entry.shift?.location.timezone
                    )}
                  </p>
                  {entry.manager ? (
                    <p>
                      <span className="font-semibold text-zinc-800">Manager:</span>{" "}
                      {formatPersonLabel(entry.manager)}
                    </p>
                  ) : null}
                </div>

                {entry.reason ? <p className="mt-1 text-xs text-zinc-600"><span className="font-semibold text-zinc-800">Reason:</span> {entry.reason}</p> : null}

                <div className="mt-2 flex gap-2">
                  {role === "STAFF" && entry.status === "PENDING_PEER" && entry.targetUserId === userId ? (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => handleAction(entry.id, "accept")}
                      disabled={Boolean(actingRequestId) || Boolean(decisionRequestId) || isCreating}
                    >
                      {actingRequestId === entry.id ? "Processing..." : "Accept"}
                    </Button>
                  ) : null}

                  {role === "STAFF" && entry.requesterId === userId && ["PENDING_PEER", "PENDING_MANAGER", "APPROVED"].includes(entry.status) ? (
                    <Button
                      type="button"
                      variant="secondary"
                      className="border-zinc-300"
                      onClick={() => handleAction(entry.id, "cancel")}
                      disabled={Boolean(actingRequestId) || Boolean(decisionRequestId) || isCreating}
                    >
                      {actingRequestId === entry.id ? "Processing..." : "Cancel"}
                    </Button>
                  ) : null}

                  {(role === "ADMIN" || role === "MANAGER") && entry.status === "PENDING_MANAGER" ? (
                    <>
                      <Button
                        type="button"
                        onClick={() => handleDecision(entry.id, true)}
                        disabled={Boolean(actingRequestId) || Boolean(decisionRequestId) || isCreating}
                      >
                        {decisionRequestId === entry.id ? "Processing..." : "Approve"}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => handleDecision(entry.id, false)}
                        disabled={Boolean(actingRequestId) || Boolean(decisionRequestId) || isCreating}
                      >
                        {decisionRequestId === entry.id ? "Processing..." : "Reject"}
                      </Button>
                    </>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
