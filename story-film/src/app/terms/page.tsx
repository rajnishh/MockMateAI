import type { Metadata } from "next";
import { Contact, LegalPage } from "../legal-page";
import { loadEnv } from "@/lib/env";

export const metadata: Metadata = { title: "Terms of use · Reelkar" };

// Accepted on the sign-in screens. Section "Community rules" is what App Review guideline 1.2 asks for.
export default function TermsPage() {
  const email = loadEnv().SUPPORT_EMAIL;
  return (
    <LegalPage title="Terms of use" updated="6 November 2026">
      <p>
        These terms apply when you use Reelkar on the web or in the app. By signing in you agree to them and to our{" "}
        <a href="/privacy">privacy policy</a>.
      </p>

      <h2>Community rules: zero tolerance</h2>
      <p>There is no place on Reelkar for objectionable content or abusive users. You may not make, upload or publish:</p>
      <ul>
        <li>sexual content involving minors, or any sexually explicit content;</li>
        <li>hate, harassment, threats or bullying of any person or group;</li>
        <li>content that encourages violence, self-harm or illegal acts;</li>
        <li>another real person&apos;s voice, face or likeness without their consent, or impersonation of real artists;</li>
        <li>songs, lyrics or videos you don&apos;t have the rights to.</li>
      </ul>
      <p>
        Every public song, recipe, gift and Jugalbandi has a Report button, and you can block any creator so you no
        longer see their content or receive their invites. We review reports within 24 hours, remove content that breaks
        these rules, and suspend or ban the accounts that posted it. Content reported by several people is hidden while
        we look at it.
      </p>

      <h2>Your content</h2>
      <p>
        You keep the rights you have in what you upload and make. You give us permission to store, process and show it
        only to run Reelkar for you, and, for what you publish, to show it to other users. You&apos;re responsible for
        what you make and post, including on Instagram, YouTube or WhatsApp.
      </p>

      <h2>AI-made content</h2>
      <p>
        Reelkar uses AI, which can make mistakes or produce unexpected results; check what it makes before you post it.
        Made content is labelled as AI-made, and you must not remove that label to pass it off as real footage or a real
        recording.
      </p>

      <h2>Credits and purchases</h2>
      <p>
        Making some things costs credits. On iPhone, credits are bought through Apple&apos;s In-App Purchase and
        Apple&apos;s terms and refund policy apply; refunds are requested from Apple. Credits have no cash value, can&apos;t
        be transferred, and are refunded to your balance automatically if making something fails. Credits you earn from
        remixes and recipes are credits, not money.
      </p>

      <h2>Ending your account</h2>
      <p>
        You can delete your account at any time in Settings. We may suspend or close accounts that break these terms.
      </p>

      <h2>No warranty</h2>
      <p>
        Reelkar is provided as it is. To the extent the law allows, we aren&apos;t liable for indirect losses, or for more
        than what you paid us in the last 12 months.
      </p>

      <h2>Contact</h2>
      <p>
        Questions or complaints: <Contact email={email} />.
      </p>
    </LegalPage>
  );
}
