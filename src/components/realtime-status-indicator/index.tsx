type RealtimeStatusIndicatorProps = {
  isConnected: boolean;
  className?: string;
};

export function RealtimeStatusIndicator({ isConnected, className }: RealtimeStatusIndicatorProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${
        isConnected
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-rose-200 bg-rose-50 text-rose-700"
      } ${className ?? ""}`}
      aria-live="polite"
    >
      <span
        className={`h-2 w-2 rounded-full ${isConnected ? "bg-emerald-500" : "bg-rose-500"}`}
        aria-hidden
      />
      {isConnected ? "Realtime connected" : "Realtime disconnected"}
    </span>
  );
}
