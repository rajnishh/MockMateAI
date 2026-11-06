import type { Metadata } from "next";
import { Contact, LegalPage } from "../legal-page";
import { loadEnv } from "@/lib/env";

export const metadata: Metadata = { title: "Privacy policy · Reelkar" };

// Linked from the App Store listing and the app's Settings. Keep it in step with the App Privacy
// answers in design/app-store/app-privacy.md.
export default function PrivacyPage() {
  const email = loadEnv().SUPPORT_EMAIL;
  return (
    <LegalPage title="Privacy policy" updated="6 November 2026">
      <p>
        Reelkar is an AI studio for making reels, songs and short films. This page explains what we collect, why, who
        helps us process it, and how you can delete it. We don&apos;t sell your data, we don&apos;t show ads, and we
        don&apos;t track you across other companies&apos; apps or websites.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li><b>Account:</b> your mobile number or email address (to send sign-in codes), or the name and email Google or Apple share when you sign in with them. If you use Hide My Email, we only see Apple&apos;s relay address.</li>
        <li><b>Profile:</b> the name, @handle and photo you choose, and your preferences (topic, language, reel look).</li>
        <li><b>What you make and upload:</b> topics, scripts, lyrics, photos, videos you pick from your gallery or film, and the reels, songs and videos made from them.</li>
        <li><b>Voice and audio:</b> recordings you make to hum a tune or sing. If you add your own singing voice, we keep your consent recording and statement with it; voices are private to you.</li>
        <li><b>Connected accounts:</b> if you connect Instagram or YouTube to post, we keep their access tokens, encrypted, and only use them to post what you ask us to.</li>
        <li><b>Purchases:</b> which credit pack you bought and the store&apos;s transaction id. Apple or Razorpay handle the payment itself; we never see your card details.</li>
        <li><b>Device and service data:</b> a push-notification token if you allow notifications, your IP address and basic request logs (to keep the service secure and stop abuse), and reports you send about content.</li>
      </ul>

      <h2>Why we use it</h2>
      <ul>
        <li>To sign you in, make what you ask for, save it to your account, and post it where you tell us to.</li>
        <li>To show your public songs, recipes and remixes on Listen if you choose to publish them.</li>
        <li>To keep the service safe: rate limits, abuse prevention, and reviewing reports.</li>
        <li>To send you notifications you&apos;ve turned on, such as &quot;your reel is ready&quot;.</li>
      </ul>
      <p>We don&apos;t use your content or voice to train our own AI models.</p>

      <h2>Who processes it for us</h2>
      <p>
        To make your reels and songs, the text, pictures or audio needed for that step are sent to AI providers that work
        for us: fal.ai, Runware, Cloudflare Workers AI, Google Gemini, Anthropic, OpenRouter, Groq and Sarvam AI. Sign-in
        codes go through our SMS and email providers (MSG91 and Resend). Web payments go through Razorpay and iPhone
        payments through Apple. Notifications go through Expo and Apple Push Notification service. If you connect
        Instagram or YouTube, what you choose to post goes to Meta or Google. Each of them may only use the data to
        provide their service to us.
      </p>

      <h2>What&apos;s public</h2>
      <p>
        Everything you make is private unless you publish it. A published song or recipe shows its title, your @handle,
        cover and (if you allow it) lyrics, plays and likes. A gift or Jugalbandi link can be opened by anyone who has
        it. You can make a song private again, or revoke a link, at any time.
      </p>

      <h2>AI-made content</h2>
      <p>
        Reels and songs made with Reelkar are labelled &quot;Made with AI&quot; and carry Content Credentials (C2PA)
        that say they were made with AI.
      </p>

      <h2>How long we keep it, and deleting it</h2>
      <p>
        We keep your data while you have an account. You can delete a reel, song or voice at any time, and you can delete
        your whole account in the app (You → Settings → Delete account) or on the web. Deleting your account removes your
        profile, reels, songs, voices, uploads and connected accounts straight away.
        We keep records of purchases as tax law requires.
      </p>

      <h2>Children</h2>
      <p>Reelkar is not meant for children under 13, and you must be old enough to agree to these terms where you live.</p>

      <h2>Your rights</h2>
      <p>
        You can ask for a copy of your data, ask us to correct or delete it, or complain to your data protection
        authority (in India, under the Digital Personal Data Protection Act 2023). Write to <Contact email={email} />.
      </p>

      <h2>Contact and grievance officer</h2>
      <p>
        For privacy questions, or complaints under India&apos;s IT Rules, contact our grievance officer at{" "}
        <Contact email={email} />. We acknowledge complaints within 24 hours and resolve them within 15 days.
      </p>
    </LegalPage>
  );
}
