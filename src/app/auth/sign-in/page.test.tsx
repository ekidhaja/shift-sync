import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SignInPage from "./page";

const signInMock = vi.fn();
const searchParamsGetMock = vi.fn();

vi.mock("next-auth/react", () => ({
  signIn: (...args: unknown[]) => signInMock(...args),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({
    get: (key: string) => searchParamsGetMock(key),
  }),
}));

describe("SignInPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParamsGetMock.mockReturnValue(null);
  });

  afterEach(() => {
    cleanup();
  });

  it("shows clean credential error message", async () => {
    const user = userEvent.setup();
    signInMock.mockResolvedValue({ error: "CredentialsSignin" });

    render(<SignInPage />);

    await user.type(screen.getByLabelText(/email/i), "admin.paul@coastaleats.com");
    await user.type(screen.getByLabelText(/password/i), "bad-password");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    const errorText = await screen.findByText(/incorrect email or password/i);
    expect(errorText).toBeTruthy();
  });

  it("shows query-based auth error in alert card", () => {
    searchParamsGetMock.mockImplementation((key: string) =>
      key === "error" ? "CredentialsSignin" : null
    );

    const { container } = render(<SignInPage />);

    const alert = container.querySelector('[role="alert"]');
    if (!alert) throw new Error("Alert not found");
    expect(alert.textContent).toMatch(/incorrect email or password/i);
  });

  it("keeps submit disabled until both fields are filled", async () => {
    const user = userEvent.setup();

    render(<SignInPage />);

    const submitButton = screen.getByRole("button", { name: /^sign in$/i });
    expect((submitButton as HTMLButtonElement).disabled).toBe(true);

    await user.type(screen.getByLabelText(/email/i), "admin.paul@coastaleats.com");
    expect((submitButton as HTMLButtonElement).disabled).toBe(true);

    await user.type(screen.getByLabelText(/password/i), "password123");
    expect((submitButton as HTMLButtonElement).disabled).toBe(false);
  });

  it("disables submit while signing in", async () => {
    const user = userEvent.setup();

    let resolveSignIn:
      | ((value: { error?: string | null; url?: string | null }) => void)
      | undefined;
    signInMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSignIn = resolve;
        })
    );

    render(<SignInPage />);

    await user.type(screen.getByLabelText(/email/i), "admin.paul@coastaleats.com");
    await user.type(screen.getByLabelText(/password/i), "password123");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    const submitButton = screen.getByRole("button", { name: /signing in/i });
    expect((submitButton as HTMLButtonElement).disabled).toBe(true);

    resolveSignIn?.({ error: "CredentialsSignin" });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^sign in$/i })).toBeTruthy();
    });
  });
});
