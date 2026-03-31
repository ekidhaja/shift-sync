"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/button";
import { InlineAlert } from "@/components/inline-alert";
import { Input } from "@/components/input";

export type ProfileFormValues = {
  name?: string | null;
  desiredWeeklyHours?: number | null;
};

type ProfileFormProps = {
  initialValues?: ProfileFormValues;
  onSubmit?: (values: ProfileFormValues) => void | Promise<void>;
  submitPath?: string;
  submitMethod?: "POST" | "PATCH";
  showDesiredWeeklyHours?: boolean;
};

export function ProfileForm({
  initialValues,
  onSubmit,
  submitPath,
  submitMethod = "PATCH",
  showDesiredWeeklyHours = true,
}: ProfileFormProps) {
  const [name, setName] = useState(initialValues?.name ?? "");
  const [desiredWeeklyHoursInput, setDesiredWeeklyHoursInput] = useState(
    String(initialValues?.desiredWeeklyHours ?? 40)
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!successMessage) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setSuccessMessage(null);
    }, 30000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [successMessage]);

  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();

        const normalizedHoursInput = desiredWeeklyHoursInput.trim();
        const parsedHours = Number.parseInt(normalizedHoursInput, 10);
        const values = {
          name: name.trim(),
          ...(showDesiredWeeklyHours
            ? {
                desiredWeeklyHours:
                  normalizedHoursInput.length === 0 || Number.isNaN(parsedHours)
                    ? undefined
                    : parsedHours,
              }
            : {}),
        };

        setIsSubmitting(true);
        setErrorMessage(null);
        setSuccessMessage(null);

        try {
          if (onSubmit) {
            await onSubmit(values);
            setSuccessMessage("Profile saved successfully.");
            return;
          }

          if (!submitPath) {
            setErrorMessage("Save is not configured for this form.");
            return;
          }

          const response = await fetch(submitPath, {
            method: submitMethod,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(values),
          });

          if (!response.ok) {
            let apiError: string | null = null;
            try {
              const responseBody = await response.json();
              const parsedError = responseBody?.error;
              const parsedDetails = responseBody?.details?.fieldErrors;

              if (typeof parsedError === "string") {
                apiError = parsedError;
              }

              if (
                parsedDetails
                && typeof parsedDetails === "object"
                && !Array.isArray(parsedDetails)
              ) {
                const detailMessages = Object.values(parsedDetails)
                  .flat()
                  .filter((entry) => typeof entry === "string") as string[];

                if (detailMessages.length > 0) {
                  apiError = detailMessages.join(" ");
                }
              }
            } catch {
              apiError = null;
            }

            setErrorMessage(apiError ?? "Could not save profile. Please try again.");
            return;
          }

          setSuccessMessage("Profile saved successfully.");
        } catch {
          setErrorMessage("Unable to save profile right now. Please try again.");
        } finally {
          setIsSubmitting(false);
        }
      }}
    >
      {errorMessage ? (
        <InlineAlert variant="error">
          {errorMessage}
        </InlineAlert>
      ) : null}

      {successMessage ? (
        <InlineAlert variant="success">
          {successMessage}
        </InlineAlert>
      ) : null}

      <div className="space-y-2">
        <label htmlFor="profile-name" className="text-sm font-medium text-zinc-700">
          Name
        </label>
        <Input
          id="profile-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Your name"
          disabled={isSubmitting}
        />
      </div>
      {showDesiredWeeklyHours ? (
        <div className="space-y-2">
          <label
            htmlFor="profile-hours"
            className="text-sm font-medium text-zinc-700"
          >
            Desired weekly hours
          </label>
          <Input
            id="profile-hours"
            type="number"
            value={desiredWeeklyHoursInput}
            onChange={(event) => setDesiredWeeklyHoursInput(event.target.value)}
            min={0}
            max={80}
            disabled={isSubmitting}
          />
        </div>
      ) : null}
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Saving..." : "Save profile"}
      </Button>
    </form>
  );
}
