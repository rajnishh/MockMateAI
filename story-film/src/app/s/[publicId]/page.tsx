import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { pickLang } from "@/app/g/[token]/copy";
import { getDb } from "@/lib/db";
import { loadEnv } from "@/lib/env";
import { publicSong, publicSongView, songRails } from "@/lib/listen";
import { getUserId } from "@/lib/session";
import { SongPage } from "./song-page";

// A public song's link page: opens with no sign-in, like the gift page. Shared from the app's
// native share sheet, so its link preview is what WhatsApp shows.
export async function generateMetadata({ params }: { params: Promise<{ publicId: string }> }): Promise<Metadata> {
  const { publicId } = await params;
  const found = await publicSong(getDb(), publicId);
  if (!found || !found.song.publishedAt || found.song.takenDownAt) return { title: "Reelkar" };
  const base = loadEnv().BETTER_AUTH_URL;
  const title = `${found.song.title} · @${found.handle}`;
  const description = "A song made with AI on Reelkar. Tap to listen.";
  const image = found.song.coverPath ? `${base}/api/listen/songs/${publicId}/cover` : undefined;
  return {
    metadataBase: new URL(base),
    title,
    description,
    openGraph: { title, description, siteName: "Reelkar", type: "music.song", url: `${base}/s/${publicId}`, images: image ? [image] : undefined },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function Page({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  const db = getDb();
  const found = await publicSong(db, publicId);
  if (!found) notFound();
  const viewerId = await getUserId().catch(() => undefined);
  const view = await publicSongView(db, found, viewerId);
  const rails = view.state === "public" ? await songRails(db, found, viewerId) : { moreLikeThis: [], byCreator: [] };
  const lang = pickLang((await headers()).get("accept-language"));
  return (
    <>
      {lang === "ar" ? (
        // eslint-disable-next-line @next/next/no-page-custom-font -- Arabic only on this page, loaded at runtime like the app fonts
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@400;600;700&display=swap" />
      ) : null}
      <SongPage view={view} rails={rails} lang={lang} signedIn={Boolean(viewerId)} url={`${loadEnv().BETTER_AUTH_URL}/s/${publicId}`} />
    </>
  );
}
