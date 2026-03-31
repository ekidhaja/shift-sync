import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SwapCenter } from "./index";

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

describe("SwapCenter realtime", () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("reloads swap queue when swap.updated message arrives", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => ({ data: [] }),
      } as Response);

    vi.stubGlobal("fetch", fetchMock);

    render(<SwapCenter role="STAFF" userId="staff-user-id" />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/swaps");
      expect(fetchMock).toHaveBeenCalledWith("/api/swaps/options");
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    const socket = MockWebSocket.instances[0];
    socket.emit({ type: "swap.updated" });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });
  });

  it("ignores unrelated realtime messages", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => ({ data: [] }),
      } as Response);

    vi.stubGlobal("fetch", fetchMock);

    render(<SwapCenter role="STAFF" userId="staff-user-id" />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    const socket = MockWebSocket.instances[0];
    socket.emit({ type: "schedule.updated" });

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("hides create swap section for manager role", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => ({ data: [] }),
      } as Response);

    vi.stubGlobal("fetch", fetchMock);

    render(<SwapCenter role="MANAGER" userId="manager-user-id" />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/swaps");
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    expect(screen.queryByText("Create swap/drop request")).not.toBeInTheDocument();
    expect(screen.getByText("Request queue")).toBeInTheDocument();
  });
});
