import { NextResponse } from "next/server";
import { validTimeZone } from "@/lib/agent/time";
import { getDb } from "@/lib/db";
import { issuerFor } from "@/lib/oauth/config";
import { approve, AuthorizeError, deny, parseAuthorization } from "@/lib/oauth/server";
import { getUserId } from "@/lib/session";

const see = (url: string) => NextResponse.redirect(url, 303);

// The consent screen's Allow or Deny. Only Reelkar's own page may post here (checked by Origin;
// the session cookie is SameSite=Lax as well), and the request is checked again in full.
export async function POST(req: Request) {
  const issuer = issuerFor(req.headers);
  if (req.headers.get("origin") !== issuer) return NextResponse.json({ error: "Wrong origin" }, { status: 403 });
  const form = new URLSearchParams(await req.text());
  const query = new URLSearchParams(form);
  for (const k of ["decision", "time_zone"]) query.delete(k);
  const userId = await getUserId();
  if (!userId) return see(`${issuer}/login?next=${encodeURIComponent(`/oauth/authorize?${query}`)}`);
  try {
    const request = await parseAuthorization(getDb(), query, issuer);
    if (form.get("decision") !== "allow") return see(deny(request, issuer));
    return see(await approve(getDb(), request, issuer, userId, validTimeZone(form.get("time_zone") ?? undefined)));
  } catch (e) {
    if (!(e instanceof AuthorizeError)) throw e;
    if (e.redirect) return see(e.redirect);
    return see(`${issuer}/oauth/authorize?${query}`);
  }
}
