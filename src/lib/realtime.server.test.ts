import { afterEach, describe, expect, it, vi } from "vitest";
import { emitRealtimeEvent } from "./realtime.server";

type EventHandler = () => void;

const { wsInstances, MockWebSocket } = vi.hoisted(() => {
  class HoistedMockWebSocket {
    public readonly url: string;
    public readonly handlers: Record<string, EventHandler | undefined> = {};
    public sentMessages: string[] = [];

    constructor(url: string) {
      this.url = url;
      wsInstances.push(this);
    }

    once(event: string, handler: EventHandler) {
      this.handlers[event] = handler;
    }

    send(message: string) {
      this.sentMessages.push(message);
    }

    close() {
      this.handlers.close?.();
    }

    trigger(event: "open" | "error" | "close") {
      this.handlers[event]?.();
    }
  }

  const wsInstances: HoistedMockWebSocket[] = [];

  return {
    wsInstances,
    MockWebSocket: HoistedMockWebSocket,
  };
});

vi.mock("ws", () => ({
  default: MockWebSocket,
}));

describe("emitRealtimeEvent", () => {
  afterEach(() => {
    wsInstances.length = 0;
    delete process.env.WS_BROADCAST_URL;
    delete process.env.NEXT_PUBLIC_WS_URL;
    vi.useRealTimers();
  });

  it("sends broadcast payload when socket opens", async () => {
    process.env.WS_BROADCAST_URL = "ws://broadcast.example";

    const promise = emitRealtimeEvent("schedule.updated", { locationId: "loc-1" });

    const socket = wsInstances[0];
    expect(socket.url).toBe("ws://broadcast.example");

    socket.trigger("open");
    await promise;

    expect(socket.sentMessages).toHaveLength(1);
    expect(JSON.parse(socket.sentMessages[0])).toEqual({
      type: "broadcast",
      event: "schedule.updated",
      payload: { locationId: "loc-1" },
    });
  });

  it("resolves cleanly when socket errors", async () => {
    const promise = emitRealtimeEvent("swap.updated", { swapRequestId: "swap-1" });

    const socket = wsInstances[0];
    socket.trigger("error");

    await expect(promise).resolves.toBeUndefined();
  });

  it("resolves on timeout when socket never connects", async () => {
    vi.useFakeTimers();

    const promise = emitRealtimeEvent("notification.updated", { userId: "u1" });
    await vi.advanceTimersByTimeAsync(900);

    await expect(promise).resolves.toBeUndefined();
  });
});
