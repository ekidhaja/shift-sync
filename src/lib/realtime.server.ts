import WebSocket from "ws";

const REALTIME_EMIT_TIMEOUT_MS = 800;

function getWsUrl() {
  return process.env.WS_BROADCAST_URL ?? process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:3001";
}

export async function emitRealtimeEvent(event: string, payload: Record<string, unknown>) {
  const wsUrl = getWsUrl();

  await new Promise<void>((resolve) => {
    let resolved = false;

    const finish = () => {
      if (resolved) {
        return;
      }

      resolved = true;
      resolve();
    };

    const timeoutId = setTimeout(() => {
      finish();
    }, REALTIME_EMIT_TIMEOUT_MS);

    try {
      const socket = new WebSocket(wsUrl);

      socket.once("open", () => {
        socket.send(
          JSON.stringify({
            type: "broadcast",
            event,
            payload,
          })
        );
        socket.close();
      });

      socket.once("close", () => {
        clearTimeout(timeoutId);
        finish();
      });

      socket.once("error", () => {
        clearTimeout(timeoutId);
        finish();
      });
    } catch {
      clearTimeout(timeoutId);
      finish();
    }
  });
}
