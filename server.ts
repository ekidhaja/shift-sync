import { WebSocketServer } from "ws";

const port = Number(process.env.PORT ?? process.env.WS_PORT ?? 3001);

const wss = new WebSocketServer({ port });

function broadcast(message: unknown) {
  const payload = JSON.stringify(message);

  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) {
      client.send(payload);
    }
  }
}

wss.on("connection", (socket) => {
  socket.send(
    JSON.stringify({
      type: "ws:connected",
      message: "ShiftSync WebSocket connected",
    })
  );

  socket.on("message", (rawMessage) => {
    try {
      const parsed = JSON.parse(rawMessage.toString()) as {
        type?: string;
        event?: string;
        payload?: unknown;
      };

      if (parsed.type === "ping") {
        socket.send(
          JSON.stringify({
            type: "pong",
            at: new Date().toISOString(),
          })
        );
        return;
      }

      if (parsed.type === "broadcast" && parsed.event) {
        broadcast({
          type: parsed.event,
          payload: parsed.payload ?? null,
          at: new Date().toISOString(),
        });
      }
    } catch {
      socket.send(
        JSON.stringify({
          type: "ws:error",
          message: "Invalid websocket payload.",
        })
      );
    }
  });
});

setInterval(() => {
  broadcast({
    type: "schedule.updated",
    payload: {
      action: "temporal_tick",
    },
    at: new Date().toISOString(),
  });
}, 60_000);

console.log(`WebSocket server running on ws://localhost:${port}`);
