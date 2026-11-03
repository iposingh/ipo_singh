"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { setThemeChoice } from "@/components/theme/theme-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { readCsrfToken } from "@/features/auth/csrf";
import { publicAccountSchema, type AccountPreferences, type PublicAccount } from "@ipo-singh/contracts";

const categories = [
  ["open", "Open"],
  ["closing", "Closing"],
  ["gmp", "GMP"],
  ["subscription", "Subscription"],
  ["allotment", "Allotment"],
  ["listing", "Listing"],
  ["schedule", "Schedule changes"],
  ["announcement", "IPO Singh announcements"],
] as const;

function csrfHeaders(): Headers {
  const headers = new Headers({ accept: "application/json", "content-type": "application/json" });
  const csrf = readCsrfToken(document.cookie);
  if (csrf) headers.set("x-csrf-token", csrf);
  return headers;
}

async function readMessage(response: Response, fallback: string): Promise<string> {
  const payload: unknown = await response.json().catch(() => null);
  if (payload && typeof payload === "object" && "fieldErrors" in payload && Array.isArray(payload.fieldErrors)) {
    const first = payload.fieldErrors[0];
    if (first && typeof first === "object" && "message" in first && typeof first.message === "string") return first.message;
  }
  if (payload && typeof payload === "object" && "message" in payload && typeof payload.message === "string") return payload.message;
  return fallback;
}

function readAccount(payload: unknown): PublicAccount | null {
  if (!payload || typeof payload !== "object" || !("account" in payload)) return null;
  const parsed = publicAccountSchema.safeParse((payload as { account: unknown }).account);
  return parsed.success ? parsed.data : null;
}

export function ProfileForms({
  account,
  onAccount,
  onAccountClosed,
}: {
  account: PublicAccount;
  onAccount: (account: PublicAccount) => void;
  onAccountClosed?: () => void;
}) {
  const [displayName, setDisplayName] = useState(account.displayName ?? "");
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [preferences, setPreferences] = useState<AccountPreferences>(account.preferences);
  const [preferenceBusy, setPreferenceBusy] = useState(false);
  const [preferenceError, setPreferenceError] = useState<string | null>(null);
  const [preferenceSaved, setPreferenceSaved] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function saveName(event: FormEvent) {
    event.preventDefault();
    setProfileBusy(true);
    setProfileError(null);
    setProfileSaved(false);
    try {
      const response = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: csrfHeaders(),
        body: JSON.stringify({ displayName: displayName.trim() === "" ? null : displayName }),
      });
      const payload: unknown = await response.json().catch(() => null);
      const next = readAccount(payload);
      if (!response.ok || !next) {
        setProfileError(await readMessage(new Response(JSON.stringify(payload), { status: response.status }), "The name could not be saved."));
        return;
      }
      onAccount(next);
      setProfileSaved(true);
    } catch {
      setProfileError("Your account could not be updated.");
    } finally {
      setProfileBusy(false);
    }
  }

  async function savePassword(event: FormEvent) {
    event.preventDefault();
    setPasswordBusy(true);
    setPasswordError(null);
    setPasswordSaved(false);
    try {
      const response = await fetch("/api/auth/password", {
        method: "POST",
        headers: csrfHeaders(),
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (!response.ok) {
        setPasswordError(await readMessage(response, "The password could not be changed."));
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setPasswordSaved(true);
    } catch {
      setPasswordError("Your account could not be updated.");
    } finally {
      setPasswordBusy(false);
    }
  }

  async function savePreferences(event: FormEvent) {
    event.preventDefault();
    setPreferenceBusy(true);
    setPreferenceError(null);
    setPreferenceSaved(false);
    try {
      const response = await fetch("/api/auth/preferences", {
        method: "PATCH",
        headers: csrfHeaders(),
        body: JSON.stringify({
          colorScheme: preferences.colorScheme,
          defaultBoard: preferences.defaultBoard,
          alertsEnabled: preferences.alertsEnabled,
          notificationCategories: preferences.notificationCategories,
          watchlistDisplay: preferences.watchlistDisplay,
          mobilePush: preferences.mobilePush,
        }),
      });
      const payload: unknown = await response.json().catch(() => null);
      const next = readAccount(payload);
      if (!response.ok || !next) {
        setPreferenceError(await readMessage(new Response(JSON.stringify(payload), { status: response.status }), "Those preferences could not be saved."));
        return;
      }
      setPreferences(next.preferences);
      setThemeChoice(next.preferences.colorScheme);
      onAccount(next);
      setPreferenceSaved(true);
    } catch {
      setPreferenceError("Your account could not be updated.");
    } finally {
      setPreferenceBusy(false);
    }
  }

  const boardHref = preferences.defaultBoard === "sme" ? "/ipos/sme" : preferences.defaultBoard === "mainboard" ? "/ipos/mainboard" : null;

  return (
    <div className="grid gap-4">
      <Card className="grid gap-3">
        <h2 className="text-lg font-semibold text-foreground">Profile</h2>
        <p className="text-sm text-muted">{account.email}</p>
        <p className="text-sm leading-6 text-muted">Email cannot be changed here. A verification message is not sent.</p>
        <form className="grid gap-3" noValidate onSubmit={(event) => void saveName(event)}>
          <Input id="display-name" label="Display name" value={displayName} maxLength={80} onChange={(event) => setDisplayName(event.target.value)} />
          {profileError ? (
            <p role="alert" className="text-sm text-negative-text">
              {profileError}
            </p>
          ) : null}
          {profileSaved ? (
            <p role="status" className="text-sm text-foreground">
              Display name saved.
            </p>
          ) : null}
          <Button type="submit" loading={profileBusy}>
            {profileBusy ? "Saving name" : "Save name"}
          </Button>
        </form>
      </Card>
      <Card className="grid gap-3">
        <h2 className="text-lg font-semibold text-foreground">Password</h2>
        <form className="grid gap-3" noValidate onSubmit={(event) => void savePassword(event)}>
          <Input id="current-password" label="Current password" type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
          <Input id="new-password" label="New password" type="password" autoComplete="new-password" value={newPassword} hint="Use 12 to 128 characters with a letter and a number." onChange={(event) => setNewPassword(event.target.value)} />
          {passwordError ? (
            <p role="alert" className="text-sm text-negative-text">
              {passwordError}
            </p>
          ) : null}
          {passwordSaved ? (
            <p role="status" className="text-sm text-foreground">
              Password changed. Other sessions were signed out.
            </p>
          ) : null}
          <Button type="submit" loading={passwordBusy}>
            {passwordBusy ? "Changing password" : "Change password"}
          </Button>
        </form>
      </Card>
      <Card className="grid gap-3">
        <h2 className="text-lg font-semibold text-foreground">Preferences</h2>
        <p className="text-sm leading-6 text-muted">These choices are stored on your account. Email and SMS are not sent. Phone reminders go only to a registered device that opted in.</p>
        <form className="grid gap-3" noValidate onSubmit={(event) => void savePreferences(event)}>
          <Select
            id="default-board"
            label="Default IPO category"
            value={preferences.defaultBoard ?? "unset"}
            onValueChange={(value) =>
              setPreferences((current) => ({ ...current, defaultBoard: value === "sme" || value === "mainboard" ? value : null }))
            }
            options={[
              { value: "unset", label: "No default" },
              { value: "mainboard", label: "Mainboard" },
              { value: "sme", label: "SME" },
            ]}
          />
          {boardHref ? (
            <Link href={boardHref} className="text-sm text-link underline">
              Open that IPO list
            </Link>
          ) : null}
          <Select
            id="color-scheme"
            label="Website theme"
            value={preferences.colorScheme}
            onValueChange={(value) =>
              setPreferences((current) => ({ ...current, colorScheme: value === "light" || value === "dark" ? value : "system" }))
            }
            options={[
              { value: "system", label: "System" },
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
            ]}
          />
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={preferences.alertsEnabled}
              onChange={(event) => setPreferences((current) => ({ ...current, alertsEnabled: event.target.checked }))}
            />
            Enable in-app alerts
          </label>
          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium text-foreground">Notification categories</legend>
            {categories.map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={preferences.notificationCategories[key]}
                  onChange={(event) =>
                    setPreferences((current) => ({
                      ...current,
                      notificationCategories: { ...current.notificationCategories, [key]: event.target.checked },
                    }))
                  }
                />
                {label}
              </label>
            ))}
          </fieldset>
          <Link href="/notifications" className="text-sm text-link underline">
            Open notification center
          </Link>
          <Select
            id="watchlist-density"
            label="Watchlist density"
            value={preferences.watchlistDisplay.density}
            onValueChange={(value) =>
              setPreferences((current) => ({
                ...current,
                watchlistDisplay: { ...current.watchlistDisplay, density: value === "compact" ? "compact" : "comfortable" },
              }))
            }
            options={[
              { value: "comfortable", label: "Comfortable" },
              { value: "compact", label: "Compact" },
            ]}
            hint="These choices apply on the watchlist."
          />
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={preferences.watchlistDisplay.showGmp}
              onChange={(event) =>
                setPreferences((current) => ({ ...current, watchlistDisplay: { ...current.watchlistDisplay, showGmp: event.target.checked } }))
              }
            />
            Show GMP
          </label>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={preferences.watchlistDisplay.showSubscription}
              onChange={(event) =>
                setPreferences((current) => ({
                  ...current,
                  watchlistDisplay: { ...current.watchlistDisplay, showSubscription: event.target.checked },
                }))
              }
            />
            Show subscription
          </label>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={preferences.watchlistDisplay.showDates}
              onChange={(event) =>
                setPreferences((current) => ({ ...current, watchlistDisplay: { ...current.watchlistDisplay, showDates: event.target.checked } }))
              }
            />
            Show dates
          </label>
          <Select
            id="mobile-push"
            label="Mobile push"
            value={preferences.mobilePush}
            onValueChange={(value) => setPreferences((current) => ({ ...current, mobilePush: value === "when-available" ? "when-available" : "off" }))}
            options={[
              { value: "off", label: "Off" },
              { value: "when-available", label: "When available" },
            ]}
            hint="When available allows phone reminders on a registered phone. Off sends nothing. This website does not register a phone."
          />
          {preferenceError ? (
            <p role="alert" className="text-sm text-negative-text">
              {preferenceError}
            </p>
          ) : null}
          {preferenceSaved ? (
            <p role="status" className="text-sm text-foreground">
              Preferences saved.
            </p>
          ) : null}
          <Button type="submit" loading={preferenceBusy}>
            {preferenceBusy ? "Saving preferences" : "Save preferences"}
          </Button>
        </form>
      </Card>
      <Card className="grid gap-3">
        <h2 className="text-lg font-semibold text-foreground">Close account</h2>
        <p className="text-sm leading-6 text-muted">
          Closing your account removes your watchlist and notification tokens and signs out every device. Public IPO
          pages stay available without an account. Enter your password to confirm.
        </p>
        <form
          className="grid gap-3"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void (async () => {
              setDeleteBusy(true);
              setDeleteError(null);
              try {
                const response = await fetch("/api/auth/delete-account", {
                  method: "POST",
                  headers: csrfHeaders(),
                  body: JSON.stringify({ password: deletePassword, confirmation: "DELETE" }),
                });
                if (!response.ok) {
                  setDeleteError(await readMessage(response, "The account could not be closed."));
                  return;
                }
                setDeletePassword("");
                onAccountClosed?.();
              } catch {
                setDeleteError("The account could not be closed.");
              } finally {
                setDeleteBusy(false);
              }
            })();
          }}
        >
          <Input
            id="delete-password"
            label="Password to close account"
            type="password"
            autoComplete="current-password"
            value={deletePassword}
            onChange={(event) => setDeletePassword(event.target.value)}
          />
          {deleteError ? (
            <p role="alert" className="text-sm text-negative-text">
              {deleteError}
            </p>
          ) : null}
          <Button type="submit" loading={deleteBusy} disabled={deletePassword.length === 0}>
            {deleteBusy ? "Closing account" : "Close account"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
