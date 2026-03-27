"use strict";
var _a, _b;
Object.defineProperty(exports, "__esModule", { value: true });
const ws_1 = require("ws");
const port = Number((_b = (_a = process.env.PORT) !== null && _a !== void 0 ? _a : process.env.WS_PORT) !== null && _b !== void 0 ? _b : 3001);
const wss = new ws_1.WebSocketServer({ port });
wss.on("connection", (socket) => {
    socket.send(JSON.stringify({
        type: "ws:connected",
        message: "ShiftSync WebSocket connected",
    }));
});
console.log(`WebSocket server running on ws://localhost:${port}`);
