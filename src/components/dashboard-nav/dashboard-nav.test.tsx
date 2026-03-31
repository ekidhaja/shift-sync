import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DashboardNav } from "./index";

const signOutMock = vi.fn();

vi.mock("next-auth/react", () => ({
  signOut: (...args: unknown[]) => signOutMock(...args),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/profile",
}));

afterEach(() => {
  cleanup();
});

describe("DashboardNav", () => {
  it("renders logout button", () => {
    render(<DashboardNav userName="Avery Admin" />);

    expect(screen.getByRole("button", { name: /logout/i })).toBeTruthy();
    expect(screen.getByLabelText("signed-in-user").textContent).toMatch(
      /avery admin/i
    );
  });

  it("calls signOut with sign-in callback URL", async () => {
    const user = userEvent.setup();

    render(<DashboardNav />);

    await user.click(screen.getByRole("button", { name: /logout/i }));

    expect(signOutMock).toHaveBeenCalledWith({ callbackUrl: "/auth/sign-in" });
  });
});
