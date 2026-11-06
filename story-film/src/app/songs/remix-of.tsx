"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { RemixPanel } from "./remix-panel";
import type { RemixKindInfo, StudioSong } from "./studio-types";
import { useSongAudio } from "./use-song-audio";
import "./studio.css";

interface PublicPage {
  song: { publicId: string; title: string; handle: string; genre: string; lyrics: string | null; durationSec: number; audioUrl: string };
  remix: { kinds: RemixKindInfo[]; blocked: "mine" | "off" | "ownVoice" | "tooLong" | "notPublic" | null };
  earnRateBp: number;
}

const BLOCKED: Record<string, (h: string) => string> = {
  mine: () => "This is your own song: remix it from My songs below, in Song Studio.",
  off: (h) => `@${h} has turned off remixes for this song.`,
  ownVoice: (h) => `This song is sung in @${h}'s own voice, so it can't be remixed.`,
  tooLong: () => "This song is longer than 4 minutes, so it can't be remixed.",
  notPublic: () => "This song isn't public any more.",
};

// /songs?remixOf={publicId}: remix someone's public song on the web (design/community/remix-spec.md),
// with the kinds open on it and its maker credited. The remix is saved as the creator's own song.
export function RemixOf({ publicId }: { publicId: string }) {
  const router = useRouter();
  const [page, setPage] = useState<PublicPage | null>(null);
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const audio = useSongAudio(page?.song.audioUrl ?? null);

  useEffect(() => {
    fetch(`/api/listen/songs/${publicId}`)
      .then(async (r) => (r.ok ? setPage(await r.json()) : setError(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "We couldn't find that song.")))
      .catch(() => setError("Couldn't load the song. Try again."));
    fetch(`/api/listen/songs/${publicId}/analysis`)
      .then(async (r) => r.ok && setPeaks(((await r.json()) as { peaks: number[] }).peaks))
      .catch(() => undefined);
  }, [publicId]);

  if (error) return <div className="status">{error}</div>;
  if (!page) return <section className="card st-panel"><p className="muted">Loading…</p></section>;
  const s = page.song;
  const song: StudioSong = { id: s.publicId, title: s.title, genre: s.genre, lyrics: s.lyrics ?? "", durationSec: s.durationSec, status: "completed", error: null, audioUrl: s.audioUrl, contentCredentials: false };
  return (
    <section className="card st-panel" aria-label="Remix">
      <h2>Remix</h2>
      <div className="row">
        <audio ref={audio.ref} src={s.audioUrl} preload="metadata" />
        <button type="button" className="st-play" onClick={audio.toggle} aria-label={audio.playing ? "Pause" : "Play"}>
          {audio.playing ? "❚❚" : "▶"}
        </button>
        <p>
          Remixing <strong dir="auto">{s.title}</strong> by <bdi>@{s.handle}</bdi>
        </p>
      </div>
      {page.remix.blocked ? (
        <div className="status">{BLOCKED[page.remix.blocked]?.(s.handle)}</div>
      ) : (
        <>
          <p className="muted">
            Credit goes to <bdi>@{s.handle}</bdi>. Your remix says &ldquo;A remix of {s.title} by @{s.handle}&rdquo;. They earn {page.earnRateBp / 100}% of the paid credits you spend. Nothing is charged if it fails.
          </p>
          <RemixPanel song={song} kinds={page.remix.kinds.filter((k) => !k.unavailable)} peaks={peaks} audio={audio} onDone={(id) => router.push(`/songs/${id}`)} />
        </>
      )}
      <a href={`/s/${s.publicId}`}>← Back to the song</a>
    </section>
  );
}
