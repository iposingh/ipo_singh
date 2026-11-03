"use client";

import { accountEmailSchema } from "@ipo-singh/contracts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { loadAdminGate } from "@/features/admin/admin-session";

type FieldErrors = {
  email?: string;
  password?: string;
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
  }
  if (!errors.email && !errors.password) {
    errors.form = typeof record.message === "string" ? record.message : "Check the email and password and try again.";
  }
  return errors;
}

export function AdminLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void loadAdminGate().then((gate) => {
      if (gate.state === "ready") router.replace("/admin");
      if (gate.state === "denied") router.replace("/admin/denied");
    });
  }, [router]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: FieldErrors = {};
    if (!accountEmailSchema.safeParse(email).success) nextErrors.email = "Enter a valid email address.";
    if (password.length < 1 || password.length > 128) nextErrors.password = "Enter your password.";
    if (nextErrors.email || nextErrors.password) {
      setErrors(nextErrors);
      return;
    }
    setLoading(true);
    setErrors({});
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setErrors(errorsFrom(payload));
        return;
      }
      const gate = await loadAdminGate();
      if (gate.state === "denied") {
        router.push("/admin/denied");
        router.refresh();
        return;
      }
      if (gate.state !== "ready") {
        setErrors({ form: "Sign-in is temporarily unavailable." });
        return;
      }
      router.push("/admin");
      router.refresh();
    } catch {
      setErrors({ form: "Sign-in is temporarily unavailable." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="mx-auto w-full max-w-md">
      <form className="grid gap-4" onSubmit={onSubmit} noValidate>
        <div>
          <h1 className="text-xl font-semibold text-foreground">Administrator sign-in</h1>
          <p className="mt-2 text-sm leading-6 text-muted">Public registration does not create an administrator.</p>
        </div>
        <Input
          id="admin-email"
          name="email"
          type="email"
          label="Email"
          autoComplete="username"
          inputMode="email"
          required
          maxLength={254}
          value={email}
          error={errors.email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <Input
          id="admin-password"
          name="password"
          type="password"
          label="Password"
          autoComplete="current-password"
          required
          maxLength={128}
          value={password}
          error={errors.password}
          onChange={(event) => setPassword(event.target.value)}
        />
        {errors.form ? (
          <p role="alert" className="text-sm text-negative-text">
            {errors.form}
          </p>
        ) : null}
        <Button type="submit" loading={loading}>
          {loading ? "Signing in" : "Sign in"}
        </Button>
        <Link href="/" className="text-sm text-link underline">
          View the public site
        </Link>
      </form>
    </Card>
  );
}
