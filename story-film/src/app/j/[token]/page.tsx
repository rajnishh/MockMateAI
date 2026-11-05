import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { duetByToken, duetView, HALF_CREDITS, phaseOf, roleOf, songStatusOf } from "@/lib/duets";
import { loadEnv } from "@/lib/env";
import { getUserId } from "@/lib/session";
import { findGenre } from "@/lib/songs/styles";
import { DuetPage } from "./duet-page";

// A Jugalbandi invite (design W3/W4): hear the first part, join, and sing yours right here, no app
// needed. The partner also approves the joined song here.
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const d = await duetByToken(getDb(), (await params).token);
  if (!d) return { title: "Reelkar" };
  const title = `${d.starterName} wants to sing a Jugalbandi with you`;
  const description = `“${d.topic}” · Hear the first part and sing yours · Made with AI`;
  return { metadataBase: new URL(loadEnv().BETTER_AUTH_URL), title, description, robots: { index: false, follow: false }, openGraph: { title, description, siteName: "Reelkar" } };
}

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = getDb();
  const d = await duetByToken(db, token);
  if (!d) notFound();
  const userId = await getUserId().catch(() => undefined);
  const role = userId ? roleOf(d, userId) : null;
  const songStatus = await songStatusOf(db, d);
  const [me] = userId ? await db.select({ name: user.name }).from(user).where(eq(user.id, userId)) : [];
  return (
    <DuetPage
      token={token}
      signedIn={Boolean(userId)}
      myName={me && !/^Creator \d{4}$/.test(me.name.trim()) ? me.name.trim() : ""}
      // Someone who hasn't joined sees only the invite; the two people in it see their own view.
      view={role ? duetView(d, role, songStatus, loadEnv().BETTER_AUTH_URL) : null}
      invite={{
        starterName: d.starterName,
        topic: d.topic,
        genre: findGenre(d.genre)?.label ?? d.genre,
        phase: phaseOf(d, songStatus),
        taken: Boolean(d.partnerId),
        expiresAt: d.expiresAt?.toISOString() ?? null,
        half: HALF_CREDITS,
      }}
    />
  );
}
