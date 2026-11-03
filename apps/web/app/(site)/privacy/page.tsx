import type { Metadata } from "next";
import { InfoPage } from "@/features/placeholders/info-page";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = pageMetadata({
  title: "Privacy",
  description: "How IPO Singh handles information on this website. An account stores an email and a password hash. The site does not collect PAN.",
  path: "/privacy",
});

export default function PrivacyPage() {
  return (
    <InfoPage
      title="Privacy"
      description="An account is optional. IPO pages can be read without signing in."
    >
      <p>
        A guest color theme stays in this browser under the key ipo-singh-theme. After you sign in, that choice is also
        saved on your account so another session can use it. The theme is not sent to a market-data vendor.
      </p>
      <p>
        IPO pages read the stored catalogue from the IPO Singh API. The browser does not call a market-data vendor. This
        site does not collect PAN or an application number. An optional account stores your email and a password hash.
        The password is not stored in the browser. Session cookies stay on this site, and access and refresh values are
        not written to localStorage. Email verification and password reset emails are not sent. A watchlist stores the
        IPO id, the date it was added, and an optional note. Prices and GMP are read from the catalogue when the page
        opens and are not copied into the watchlist. In-app notifications can mention a saved IPO date or a fresh GMP or subscription reading. Email and SMS are not sent. Phone reminders go only to a registered device that opted in.
      </p>
      <p>
        You can close an account from Account settings on this website or from Settings in the iOS and Android apps by
        entering your password. Closing an account removes the watchlist and notification tokens for that account and
        signs out every device. If you cannot sign in, email{" "}
        <a className="text-link underline" href="mailto:iposingh.dev@gmail.com">
          iposingh.dev@gmail.com
        </a>{" "}
        from the address on the account to request deletion. Retention required for security or abuse prevention may
        apply and will be described when relevant.
      </p>
    </InfoPage>
  );
}
