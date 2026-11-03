"use client";

import { accountEmailSchema, accountPasswordIssue } from "@ipo-singh/contracts";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { safeReturnPath } from "@/features/auth/return-path";

type AuthMode = "login" | "register";

type FieldErrors = {
  email?: string;
  password?: string;
  displayName?: string;
  form?: string;
};

function errorsFrom(payload: unknown): FieldErrors {
  if (!payload || typeof payload !== "object") return { form: "Sign-in is temporarily unavailable." };
  const record = payload as { message?: unknown; fieldErrors?: { field?: unknown; message?: unknown }[] };
  const errors: FieldErrors = {};
  for (const fieldError of record.fieldErrors ?? []) {
    const message = typeof fieldError.message === "string" ? fieldError.message : "";
    if (!message) continue;
    if (fieldError.field === "email") errors.email = message;
    if (fieldError.field === "password") errors.password = message;
    if (fieldError.field === "displayName") errors.displayName = message;
  }
  if (!errors.email && !errors.password && !errors.displayName) {
    errors.form = typeof record.message === "string" ? record.message : "Check the email and password and try again.";
  }
  return errors;
}

function clientErrors(mode: AuthMode, email: string, password: string): FieldErrors {
  const errors: FieldErrors = {};
  if (!accountEmailSchema.safeParse(email).success) errors.email = "Enter a valid email address.";
  if (mode === "register") {
    const issue = accountPasswordIssue(password, email);
    if (issue) errors.password = issue;
  } else if (password.length < 1 || password.length > 128) {
    errors.password = "Enter your password.";
  }
  return errors;
}

export function AuthForm({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const register = mode === "register";
  const next = safeReturnPath(useSearchParams().get("next"));
  const otherHref = next ? `${register ? "/login" : "/register"}?next=${encodeURIComponent(next)}` : register ? "/login" : "/register";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = clientErrors(mode, email, password);
    if (nextErrors.email || nextErrors.password) {
      setErrors(nextErrors);
      return;
    }
    setLoading(true);
    setErrors({});
    try {
      const response = await fetch(register ? "/api/auth/register" : "/api/auth/login", {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          ...(register && displayName.trim() ? { displayName: displayName.trim() } : {}),
        }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setErrors(errorsFrom(payload));
        return;
      }
      router.push(next ?? "/account");
      router.refresh();
    } catch {
      setErrors({ form: "Sign-in is temporarily unavailable." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <form className="grid gap-4" onSubmit={onSubmit} noValidate>
        {register ? (
          <Input
            id="display-name"
            name="displayName"
            label="Display name"
            autoComplete="nickname"
            maxLength={80}
            value={displayName}
            error={errors.displayName}
            hint="Optional. This is shown on your account page."
            onChange={(event) => setDisplayName(event.target.value)}
          />
        ) : null}
        <Input
          id="email"
          name="email"
          type="email"
          label="Email"
          autoComplete="email"
          inputMode="email"
          required
          maxLength={254}
          value={email}
          error={errors.email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <Input
          id="password"
          name="password"
          type="password"
          label="Password"
          autoComplete={register ? "new-password" : "current-password"}
          required
          minLength={register ? 12 : 1}
          maxLength={128}
          value={password}
          error={errors.password}
          hint={register ? "12 to 128 characters, with a letter and a number." : undefined}
          onChange={(event) => setPassword(event.target.value)}
        />
        {errors.form ? (
          <p role="alert" className="text-sm text-negative-text">
            {errors.form}
          </p>
        ) : null}
        <Button type="submit" loading={loading}>
          {loading ? (register ? "Creating account" : "Signing in") : register ? "Create account" : "Sign in"}
        </Button>
        <p className="text-sm text-muted">
          {register ? "Already have an account? " : "Don't have an account? "}
          <Link href={otherHref} className="text-link underline">
            {register ? "Sign In" : "Sign Up"}
          </Link>
        </p>
      </form>
    </Card>
  );
}
