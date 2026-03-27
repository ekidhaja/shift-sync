import { WebSocketServer } from "ws";

const port = Number(process.env.WS_PORT ?? 3001);

const wss = new WebSocketServer({ port });

wss.on("connection", (socket) => {
  socket.send(
    JSON.stringify({
      type: "ws:connected",
      message: "ShiftSync WebSocket connected",
    })
  );
});

console.log(`WebSocket server running on ws://localhost:${port}`);
