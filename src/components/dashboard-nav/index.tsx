"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { Button } from "@/components/button";
import { getRealtimeWebSocketUrl } from "@/lib/realtime-client";

type DashboardNavProps = {
  userName?: string | null;
  role?: "ADMIN" | "MANAGER" | "STAFF";
};

export function DashboardNav({ userName, role }: DashboardNavProps) {
  const pathname = usePathname();
  const [unreadCount, setUnreadCount] = useState(0);
  const showAvailabilityLink = role === "ADMIN" || role === "STAFF" || role === "MANAGER";
  const showScheduleLink = role === "ADMIN" || role === "MANAGER" || role === "STAFF";
  const showComplianceLink = role === "ADMIN" || role === "MANAGER";
  const showFairnessLink = role === "ADMIN" || role === "MANAGER";

  useEffect(() => {
    async function loadUnreadCount() {
      try {
        const response = await fetch("/api/notifications");
        if (!response.ok) {
          return;
        }

        const body = await response.json().catch(() => null);
        if (typeof body?.unreadCount === "number") {
          setUnreadCount(body.unreadCount);
        }
      } catch {
        return;
      }
    }

    void loadUnreadCount();
    const intervalId = window.setInterval(() => {
      void loadUnreadCount();
    }, 15_000);

    const wsUrl = getRealtimeWebSocketUrl();
    if (!wsUrl || typeof WebSocket === "undefined") {
      return () => {
        window.clearInterval(intervalId);
      };
    }

    const socket = new WebSocket(wsUrl);

    socket.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data) as { type?: string };
        if (parsed.type === "notifications.updated" || parsed.type === "swap.updated") {
          void loadUnreadCount();
        }
      } catch {
        return;
      }
    };

    return () => {
      window.clearInterval(intervalId);
      socket.close();
    };
  }, []);

  const linkClass = (href: string) => {
    const isActive = pathname === href;
    return `rounded-md px-2.5 py-1.5 transition-colors ${
      isActive
        ? "bg-blue-100 text-blue-800"
        : "text-zinc-700 hover:bg-zinc-100"
    }`;
  };

  return (
    <nav className="border-b border-zinc-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-4">
        <div className="flex items-center gap-6 text-sm font-medium text-zinc-700">
          <Link href="/profile" className={linkClass("/profile")}>Profile</Link>
          {showAvailabilityLink ? <Link href="/availability" className={linkClass("/availability")}>Availability</Link> : null}
          {showScheduleLink ? <Link href="/schedule" className={linkClass("/schedule")}>Schedule</Link> : null}
          <Link href="/swaps" className={linkClass("/swaps")}>Swaps</Link>
          {showComplianceLink ? <Link href="/compliance" className={linkClass("/compliance")}>Compliance</Link> : null}
          {showFairnessLink ? <Link href="/fairness" className={linkClass("/fairness")}>Fairness</Link> : null}
          <Link href="/notifications" className={`${linkClass("/notifications")} inline-flex items-center gap-1.5`}>
            Notifications
            {unreadCount > 0 ? (
              <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            ) : null}
          </Link>
        </div>

        <div className="flex items-center gap-3">
          {userName ? (
            <p className="text-sm text-zinc-600" aria-label="signed-in-user">
              {userName}
            </p>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            onClick={() => signOut({ callbackUrl: "/auth/sign-in" })}
          >
            Logout
          </Button>
        </div>
      </div>
    </nav>
  );
}
