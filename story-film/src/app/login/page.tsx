import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth, googleEnabled } from "@/lib/auth";
import { ReelLogo } from "../reel-logo";
import { LoginForm } from "./login-form";

// Where to go after signing in: a path on this site only (the connector's consent screen uses it).
const safeNext = (next: unknown) => (typeof next === "string" && /^\/(?![/\\])/.test(next) ? next : "/");

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const next = safeNext((await searchParams).next);
  if (await auth.api.getSession({ headers: await headers() })) redirect(next);
  return (
    <div className="auth">
      <section className="auth-art">
        <p className="side-brand">
          <ReelLogo size={44} label="Reelkar" />
          <span>Reelkar</span>
        </p>
        <div>
          <h1>Your first reel, <b>today.</b></h1>
          <ul>
            <li>Cartoon episodes with a character that stays the same</li>
            <li>Short films and motion reels in your language</li>
            <li>Captions, zooms and effects on videos you film</li>
          </ul>
        </div>
        <span className="halo" aria-hidden="true">
          <i />
          <i />
          <ReelLogo size={64} loop />
        </span>
      </section>
      <main className="auth-form">
        <div>
          <h2>Sign in</h2>
          <p className="sub">Make reels, cartoons and short films for Reels, Shorts and WhatsApp.</p>
          <LoginForm googleEnabled={googleEnabled} next={next} />
          <p className="muted fine">Free plan: a few videos every week. No card needed.</p>
        </div>
      </main>
    </div>
  );
}
