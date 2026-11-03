import { useState } from "react";
import { accountEmailSchema, accountPasswordIssue } from "@ipo-singh/contracts";
import { Pressable, View } from "react-native";
import { useAuth } from "../auth/provider";
import { AppText } from "../components/app-text";
import { PrimaryButton } from "../components/primary-button";
import { TextField } from "../components/text-field";
import { mobileTheme } from "../theme/theme";
import { useTheme } from "../theme/provider";

export function AccountSignIn() {
  const { palette } = useTheme();
  const { register, login } = useAuth();
  const [mode, setMode] = useState<"sign-in" | "register">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const passwordIssue = mode === "register" ? accountPasswordIssue(password, email) : null;

  function clientIssue(): string | null {
    const trimmed = email.trim();
    if (!trimmed) return "Enter your email address.";
    if (!accountEmailSchema.safeParse(trimmed).success) return "Enter a valid email address.";
    if (!password) return "Enter your password.";
    if (mode === "register" && passwordIssue) return passwordIssue;
    return null;
  }

  async function submit() {
    if (submitting) return;
    const issue = clientIssue();
    if (issue) {
      setMessage(issue);
      return;
    }
    setSubmitting(true);
    const result =
      mode === "register"
        ? await register({ email: email.trim(), password, displayName: displayName.trim() || undefined })
        : await login({ email: email.trim(), password });
    setSubmitting(false);
    setMessage(result);
    if (!result) setPassword("");
  }

  return (
    <View style={{ gap: mobileTheme.spacing[3] }}>
      <AppText size="sm" tone="muted">
        This is the same IPO Singh account used on the website. Password reset by email is not available — no email or SMS recovery channel is configured.
      </AppText>
      {mode === "register" ? (
        <TextField label="Display name" value={displayName} onChangeText={setDisplayName} autoComplete="name" maxLength={80} />
      ) : null}
      <TextField label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoComplete="email" maxLength={254} />
      <TextField
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="password"
        onSubmit={() => void submit()}
      />
      {passwordIssue && password.length > 0 ? (
        <AppText size="sm" tone="warning">
          {passwordIssue}
        </AppText>
      ) : null}
      {message ? (
        <AppText size="sm" tone="warning" accessibilityLiveRegion="polite">
          {message}
        </AppText>
      ) : null}
      <PrimaryButton label={mode === "register" ? "Create account" : "Sign in"} loading={submitting} onPress={() => void submit()} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={mode === "register" ? "Already have an account? Sign In" : "Don't have an account? Sign Up"}
        onPress={() => {
          setMode(mode === "register" ? "sign-in" : "register");
          setMessage(null);
        }}
        style={{ minHeight: mobileTheme.sizing.touchTarget, justifyContent: "center" }}
      >
        <AppText size="sm" tone="muted">
          {mode === "register" ? "Already have an account? Sign In" : "Don't have an account? Sign Up"}
        </AppText>
      </Pressable>
      <AppText size="sm" tone="muted" style={{ color: palette.muted }}>
        Use 12 to 128 characters with a letter and a number. IPO lists stay available without signing in.
      </AppText>
    </View>
  );
}
