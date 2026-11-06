import type { Metadata } from "next";
import { Contact, LegalPage } from "../legal-page";
import { loadEnv } from "@/lib/env";

export const metadata: Metadata = { title: "Help and support · Reelkar" };

// The App Store listing's Support URL.
export default function SupportPage() {
  const email = loadEnv().SUPPORT_EMAIL;
  return (
    <LegalPage title="Help and support" updated="6 November 2026">
      <p>
        Need help with Reelkar? Write to <Contact email={email} /> and we&apos;ll get back to you within two working days.
      </p>

      <h2>Signing in</h2>
      <p>
        Sign in with Apple, Google, a code sent by SMS (Indian and UAE mobiles) or a code sent by email. Codes expire after
        five minutes; if one doesn&apos;t arrive, wait a minute and tap Send code again.
      </p>

      <h2>Credits</h2>
      <p>
        Every new account gets free credits and a few free standard reels each week. If making something fails, its
        credits go back to your balance automatically. For a refund of an iPhone purchase, use Apple&apos;s{" "}
        <a href="https://reportaproblem.apple.com">Report a Problem</a> page.
      </p>

      <h2>Reporting content or a creator</h2>
      <p>
        Tap Report on any public song, recipe, gift or Jugalbandi, or Block to stop seeing a creator. We review reports
        within 24 hours.
      </p>

      <h2>Deleting your account</h2>
      <p>
        In the app: You → Settings → Delete account. This deletes your reels, songs, voices and connected accounts and
        can&apos;t be undone.
      </p>
    </LegalPage>
  );
}
