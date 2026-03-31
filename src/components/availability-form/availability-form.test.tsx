import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AvailabilityForm } from "./index";

afterEach(() => {
  cleanup();
});

describe("AvailabilityForm", () => {
  it("renders recurring fields by default", () => {
    const { container } = render(
      <AvailabilityForm locationId="loc-1" onSubmit={() => undefined} />
    );
    const form = container.querySelector("form");
    if (!form) throw new Error("Form not found");
    expect(form.querySelector("#availability-day-1")).toBeTruthy();
    expect(form.querySelector("#availability-start")).toBeTruthy();
    expect(form.querySelector("#availability-end")).toBeTruthy();
  });

  it("switches to exception fields", async () => {
    const user = userEvent.setup();

    const { container } = render(
      <AvailabilityForm locationId="loc-1" onSubmit={() => undefined} />
    );
    const form = container.querySelector("form");
    if (!form) throw new Error("Form not found");
    const typeSelect = form.querySelector(
      "#availability-type"
    ) as HTMLSelectElement;

    await user.selectOptions(typeSelect, "EXCEPTION");

    expect(form.querySelector("#availability-exception-start")).toBeTruthy();
    expect(form.querySelector("#availability-exception-end")).toBeTruthy();
  });

  it("submits recurring payload", async () => {
    const user = userEvent.setup();
    const handleSubmit = vi.fn();

    const { container } = render(
      <AvailabilityForm locationId="loc-1" onSubmit={handleSubmit} />
    );
    const form = container.querySelector("form");
    if (!form) throw new Error("Form not found");
    const typeSelect = form.querySelector(
      "#availability-type"
    ) as HTMLSelectElement;
    const wednesdayCheckbox = form.querySelector(
      "#availability-day-3"
    ) as HTMLInputElement;
    const startMinute = form.querySelector(
      "#availability-start"
    ) as HTMLInputElement;
    const endMinute = form.querySelector(
      "#availability-end"
    ) as HTMLInputElement;

    await user.selectOptions(typeSelect, "RECURRING");
    await user.click(screen.getByRole("button", { name: /clear all/i }));
    await user.click(wednesdayCheckbox);

    fireEvent.change(startMinute, { target: { value: "08:00" } });
    fireEvent.change(endMinute, { target: { value: "15:00" } });
    await user.click(
      form.querySelector("button[type='submit']") as HTMLButtonElement
    );

    expect(handleSubmit).toHaveBeenCalledWith({
      type: "RECURRING",
      dayOfWeeks: [3],
      startMinute: 480,
      endMinute: 900,
      locationIds: ["loc-1"],
    });
  });

  it("shows success message after submit", async () => {
    const user = userEvent.setup();
    const handleSubmit = vi.fn().mockResolvedValue(undefined);

    render(<AvailabilityForm locationId="loc-1" onSubmit={handleSubmit} />);

    await user.click(screen.getByRole("button", { name: /add availability/i }));

    const success = await screen.findByRole("status");
    expect(success.textContent).toMatch(/availability saved successfully/i);
  });

  it("shows error message when submit fails", async () => {
    const user = userEvent.setup();
    const handleSubmit = vi.fn().mockRejectedValue(new Error("failed"));

    render(<AvailabilityForm locationId="loc-1" onSubmit={handleSubmit} />);

    await user.click(screen.getByRole("button", { name: /add availability/i }));

    const error = await screen.findByRole("alert");
    expect(error.textContent).toMatch(/failed/i);
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

    render(<AvailabilityForm locationId="loc-1" onSubmit={handleSubmit} />);

    await user.click(screen.getByRole("button", { name: /add availability/i }));

    const loadingButton = screen.getByRole("button", { name: /saving/i });
    expect((loadingButton as HTMLButtonElement).disabled).toBe(true);

    resolveSubmit?.();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /add availability/i })).toBeTruthy();
    });
  });
});
