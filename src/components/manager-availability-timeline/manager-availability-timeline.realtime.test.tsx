import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ManagerAvailabilityTimeline } from "./index";

vi.mock("@/lib/realtime-client", () => ({
  getRealtimeWebSocketUrl: () => "ws://localhost:3001",
}));

class MockWebSocket {
  static instances: MockWebSocket[] = [];

  url: string;
  onmessage: ((event: MessageEvent) => void) | null = null;
  close = vi.fn();

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  emit(payload: unknown) {
    if (!this.onmessage) {
      return;
    }

    this.onmessage({ data: JSON.stringify(payload) } as MessageEvent);
  }
}

describe("ManagerAvailabilityTimeline realtime", () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("reloads managed availability when availability.updated arrives", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [],
          filters: { locations: [], users: [] },
        }),
      } as Response);

    vi.stubGlobal("fetch", fetchMock);

    render(<ManagerAvailabilityTimeline />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/availability/managed?", { method: "GET" });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    const socket = MockWebSocket.instances[0];
    socket.emit({ type: "availability.updated" });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  it("ignores unrelated realtime events", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [],
          filters: { locations: [], users: [] },
        }),
      } as Response);

    vi.stubGlobal("fetch", fetchMock);

    render(<ManagerAvailabilityTimeline />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    const socket = MockWebSocket.instances[0];
    socket.emit({ type: "schedule.updated" });

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
