import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { issuerFor } from "@/lib/oauth/config";
import { AuthorizeError, parseAuthorization, redirectHost } from "@/lib/oauth/server";
import { ReelLogo } from "../../reel-logo";
import { TimeZoneField } from "./time-zone-field";

export const metadata: Metadata = { title: "Connect to Reelkar" };

type Search = Promise<Record<string, string | string[] | undefined>>;

// OAuth consent: an assistant (claude.ai, the Claude phone app...) asks to use Reelkar for the creator.
// Not signed in: off to /login and back here first. Bad client or return address: an error, never a redirect.
export default async function AuthorizePage({ searchParams }: { searchParams: Search }) {
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) if (typeof v === "string") query.set(k, v);
  const h = await headers();
  const issuer = issuerFor(h);
  // Sign-in comes first, so anonymous visitors can't make Reelkar fetch client documents from anywhere.
  const session = await auth.api.getSession({ headers: h });
  if (!session) redirect(`/login?next=${encodeURIComponent(`/oauth/authorize?${query}`)}`);

  let request;
  try {
    request = await parseAuthorization(getDb(), query, issuer);
  } catch (e) {
    if (!(e instanceof AuthorizeError)) throw e;
    if (e.redirect) redirect(e.redirect);
    return (
      <Shell>
        <h2>Couldn&apos;t connect</h2>
        <p className="sub">{e.message}</p>
      </Shell>
    );
  }

  const host = redirectHost(request.redirectUri);
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
  const who = session.user.phoneNumber ?? session.user.email;
  const fields = [...query.entries()].map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />);
  return (
    <Shell>
      <h2>{request.client.name} wants to use Reelkar</h2>
      <p className="sub">Make, list and post your reels.</p>
      <ul className="oauth-can">
        <li>Suggest ideas, write captions and make reels</li>
        <li>See your reels and how far along they are</li>
        <li>Post or schedule reels, following your posting setting</li>
      </ul>
      <p className="muted">Your free reels and credits count as usual, and everything it does shows up in Ask Reelkar.</p>
      <p className="muted">
        It returns you to <strong>{host}</strong>. Signed in as {who}.
      </p>
      {local && <p className="status">This app runs on a computer, not on the web. Allow it only if you started it yourself.</p>}
      <form method="post" action="/api/oauth/authorize" className="actions">
        {fields}
        <TimeZoneField />
        <button type="submit" name="decision" value="deny" className="secondary">
          Deny
        </button>
        <button type="submit" name="decision" value="allow">
          Allow
        </button>
      </form>
      <p className="muted fine">You can disconnect it any time in Connect AI.</p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="oauth">
      <main className="auth-form">
        <div>
          <p className="side-brand">
            <ReelLogo size={36} label="Reelkar" />
            <span>Reelkar</span>
          </p>
          {children}
        </div>
      </main>
    </div>
  );
}
