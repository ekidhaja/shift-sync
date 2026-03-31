export function getRealtimeWebSocketUrl() {
  if (typeof window === "undefined") {
    return null;
  }

  const configured = process.env.NEXT_PUBLIC_WS_URL;
  if (configured) {
    return configured;
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.hostname;
  return `${protocol}//${host}:3001`;
}
