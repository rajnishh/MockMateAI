import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { pickLang } from "@/app/g/[token]/copy";
import g from "@/app/g/[token]/gift.module.css";
import { getDb } from "@/lib/db";
import { PUBLIC_ID, publicSong, publicState } from "@/lib/listen";
import { familyTree } from "@/lib/remixes";
import { songCopy } from "../copy";
import { FamilyOutline } from "../remixes";
import { Shell } from "../song-page";

export const metadata: Metadata = { title: "Family tree · Reelkar" };

// A public song's family tree (design/community/remix-spec.md X8, web): server-rendered, every node a
// plain link, so it works without JavaScript. "Show 8 more" is a link to ?branch={publicId}.
export default async function FamilyPage({ params, searchParams }: { params: Promise<{ publicId: string }>; searchParams: Promise<{ sort?: string; branch?: string }> }) {
  const { publicId } = await params;
  const q = await searchParams;
  const db = getDb();
  const found = await publicSong(db, publicId);
  if (!found || publicState(found.song) !== "public") notFound();
  const tree = await familyTree(db, found.song, { sort: q.sort === "new" ? "new" : "top", branch: q.branch && PUBLIC_ID.test(q.branch) ? q.branch : undefined });
  const lang = pickLang((await headers()).get("accept-language"));
  const t = songCopy(lang).remix;
  return (
    <>
      {lang === "ar" ? (
        // eslint-disable-next-line @next/next/no-page-custom-font -- Arabic only on this page, like the song page
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@400;600;700&display=swap" />
      ) : null}
    <Shell lang={lang} publicId={publicId}>
      <h1 className={g.title}>{t.treeTitle}</h1>
      <p className={g.meta}>
        {tree.rootTitle ? <bdi>{tree.rootTitle}</bdi> : t.gone} · {t.songs(tree.size)}
      </p>
      <FamilyOutline tree={tree} lang={lang} publicId={publicId} />
    </Shell>
    </>
  );
}
