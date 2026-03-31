"use client";

import type { HTMLAttributes } from "react";
import { useEffect, useState } from "react";

type InlineAlertVariant = "error" | "success";

type InlineAlertProps = HTMLAttributes<HTMLDivElement> & {
  variant?: InlineAlertVariant;
};

const variantStyles: Record<InlineAlertVariant, string> = {
  error: "border-red-200 bg-red-50 text-red-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

const INLINE_ALERT_AUTO_DISMISS_MS = 30_000;

export function InlineAlert({
  variant = "error",
  className = "",
  role,
  children,
  ...props
}: InlineAlertProps) {
  const resolvedRole = role ?? (variant === "error" ? "alert" : "status");
  const ariaLive = variant === "error" ? "assertive" : "polite";
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    setIsVisible(true);

    const timeoutId = window.setTimeout(() => {
      setIsVisible(false);
    }, INLINE_ALERT_AUTO_DISMISS_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [children, variant]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent)) {
      return;
    }

    if (typeof window.scrollTo !== "function") {
      return;
    }

    try {
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      window.scrollTo(0, 0);
    }
  }, []);

  if (!isVisible) {
    return null;
  }

  return (
    <div
      role={resolvedRole}
      aria-live={ariaLive}
      className={`rounded-md border px-3 py-2 text-sm ${variantStyles[variant]} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
