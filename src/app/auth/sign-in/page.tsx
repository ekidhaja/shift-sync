"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  InlineAlert,
  Input,
} from "@/components";

const SIGN_IN_TIMEOUT_MS = 12000;

function mapAuthError(errorCode?: string | null) {
  if (!errorCode) {
    return null;
  }

  if (errorCode === "CredentialsSignin") {
    return "Incorrect email or password. Please try again.";
  }

  if (errorCode === "AccessDenied") {
    return "Access denied for this account.";
  }

  if (errorCode === "Configuration") {
    return "Authentication is temporarily unavailable. Please try again shortly.";
  }

  return "Sign-in failed. Please try again.";
}

export default function SignInPage() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [hideQueryError, setHideQueryError] = useState(false);

  const queryError = hideQueryError ? null : mapAuthError(searchParams.get("error"));
  const errorMessage = submitError ?? queryError;
  const trimmedEmail = email.trim();
  const isSubmitDisabled =
    isSubmitting || trimmedEmail.length === 0 || password.length === 0;

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <h1 className="text-xl font-semibold text-zinc-900">Sign in</h1>
          <p className="text-sm text-zinc-600">
            Use your Coastal Eats credentials.
          </p>
        </CardHeader>
        <CardContent>
          {errorMessage ? (
            <InlineAlert variant="error" className="mb-4">
              {errorMessage}
            </InlineAlert>
          ) : null}

          <form
            className="space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();
              const safeEmail = email.trim();
              const safePassword = password.trim();

              if (!safeEmail || !safePassword) {
                setSubmitError("Email and password are required.");
                return;
              }

              setIsSubmitting(true);
              setSubmitError(null);
              setHideQueryError(true);

              try {
                let timeoutId: ReturnType<typeof setTimeout> | undefined;
                const timeoutPromise = new Promise<never>((_resolve, reject) => {
                  timeoutId = setTimeout(() => {
                    reject(new Error("SIGN_IN_TIMEOUT"));
                  }, SIGN_IN_TIMEOUT_MS);
                });

                const result = await Promise.race([
                  signIn("credentials", {
                    email: safeEmail,
                    password: safePassword,
                    callbackUrl: "/profile",
                    redirect: false,
                  }),
                  timeoutPromise,
                ]);

                if (timeoutId) {
                  clearTimeout(timeoutId);
                }

                if (!result || result.error) {
                  setSubmitError(mapAuthError(result?.error) ?? "Sign-in failed. Please try again.");
                  return;
                }

                if (result.url) {
                  window.location.assign(result.url);
                }
              } catch (error) {
                if (error instanceof Error && error.message === "SIGN_IN_TIMEOUT") {
                  setSubmitError("Sign-in is taking too long. Please try again in a moment.");
                } else {
                  setSubmitError("Unable to sign in right now. Please try again.");
                }
              } finally {
                setIsSubmitting(false);
              }
            }}
          >
            <div className="space-y-2">
              <label htmlFor="sign-in-email" className="text-sm font-medium text-zinc-700">
                Email
              </label>
              <Input
                id="sign-in-email"
                type="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setHideQueryError(true);
                }}
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="sign-in-password" className="text-sm font-medium text-zinc-700">
                Password
              </label>
              <Input
                id="sign-in-password"
                type="password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setHideQueryError(true);
                }}
                disabled={isSubmitting}
              />
            </div>
            <Button type="submit" className="w-full" disabled={isSubmitDisabled}>
              {isSubmitting ? "Signing in..." : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
