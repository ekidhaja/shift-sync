import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProfileForm } from "./index";

afterEach(() => {
  cleanup();
});

describe("ProfileForm", () => {
  it("renders name and desired hours fields", () => {
    render(<ProfileForm onSubmit={() => undefined} />);

    expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/desired weekly hours/i)).toBeInTheDocument();
  });

  it("submits form values", async () => {
    const user = userEvent.setup();
    const handleSubmit = vi.fn();

    const { container } = render(<ProfileForm onSubmit={handleSubmit} />);
    const form = container.querySelector("form");
    if (!form) throw new Error("Form not found");

    const nameInput = form.querySelector("#profile-name") as HTMLInputElement;
    const hoursInput = form.querySelector("#profile-hours") as HTMLInputElement;

    await user.clear(nameInput);
    await user.type(nameInput, "Taylor");
    await user.clear(hoursInput);
    await user.type(hoursInput, "36");
    await user.click(
      form.querySelector("button[type='submit']") as HTMLButtonElement
    );

    expect(handleSubmit).toHaveBeenCalledWith({
      name: "Taylor",
      desiredWeeklyHours: 36,
    });
  });

  it("uses initial values", () => {
    render(
      <ProfileForm
        initialValues={{ name: "Jamie", desiredWeeklyHours: 32 }}
        onSubmit={() => undefined}
      />
    );

    expect(screen.getByDisplayValue("Jamie")).toBeInTheDocument();
    expect(screen.getByDisplayValue("32")).toBeInTheDocument();
  });

  it("shows success message after submit", async () => {
    const user = userEvent.setup();
    const handleSubmit = vi.fn().mockResolvedValue(undefined);

    render(<ProfileForm onSubmit={handleSubmit} />);

    await user.click(screen.getByRole("button", { name: /save profile/i }));

    const success = await screen.findByRole("status");
    expect(success.textContent).toMatch(/profile saved successfully/i);
  });

  it("shows error message when submit fails", async () => {
    const user = userEvent.setup();
    const handleSubmit = vi.fn().mockRejectedValue(new Error("failed"));

    render(<ProfileForm onSubmit={handleSubmit} />);

    await user.click(screen.getByRole("button", { name: /save profile/i }));

    const error = await screen.findByRole("alert");
    expect(error.textContent).toMatch(/unable to save profile right now/i);
  });

  it("shows loading state while saving", async () => {
    const user = userEvent.setup();
    let resolveSubmit: (() => void) | undefined;
    const handleSubmit = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSubmit = resolve;
        })
    );

    render(<ProfileForm onSubmit={handleSubmit} />);

    await user.click(screen.getByRole("button", { name: /save profile/i }));

    const loadingButton = screen.getByRole("button", { name: /saving/i });
    expect((loadingButton as HTMLButtonElement).disabled).toBe(true);

    resolveSubmit?.();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /save profile/i })).toBeTruthy();
    });
  });
});
