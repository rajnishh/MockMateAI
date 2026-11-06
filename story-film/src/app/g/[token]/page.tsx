import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { loadEnv } from "@/lib/env";
import { giftUrl, publicGift, publicGiftView } from "@/lib/gifts";
import { getUserId } from "@/lib/session";
import { pickLang, previewText } from "./copy";
import { GiftPage } from "./gift-page";

// The public gift page: opens with no sign-in, in the recipient's language. Its link preview
// (title, text and opengraph-image) is what WhatsApp shows in the chat.
async function load(token: string) {
  const found = await publicGift(getDb(), token);
  if (!found) notFound();
  return found;
}

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const found = await publicGift(getDb(), token);
  if (!found) return { title: "Reelkar" };
  const lang = pickLang((await headers()).get("accept-language"));
  const v = publicGiftView(found);
  const { title, description } = previewText(lang, v, v.address);
  const base = loadEnv().BETTER_AUTH_URL;
  return {
    metadataBase: new URL(base),
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: { title, description, siteName: "Reelkar", type: "music.song", url: giftUrl(base, token) },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function Page({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ preview?: string }> }) {
  const { token } = await params;
  // The app opens the sender's own gift with ?preview=1, so their plays aren't counted.
  const preview = (await searchParams).preview === "1";
  const found = await load(token);
  const lang = pickLang((await headers()).get("accept-language"));
  const view = publicGiftView(found);
  const isSender = (await getUserId().catch(() => undefined)) === found.gift.senderId;
  return (
    <>
      {lang === "ar" ? (
        // eslint-disable-next-line @next/next/no-page-custom-font -- Arabic only on this page, loaded at runtime like the app fonts
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@400;600;700&display=swap" />
      ) : null}
      <GiftPage view={view} lang={lang} isSender={isSender} count={!preview && !isSender} url={giftUrl(loadEnv().BETTER_AUTH_URL, token)} />
    </>
  );
}
