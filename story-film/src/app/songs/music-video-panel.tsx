"use client";

import { useEffect, useState } from "react";

type Character = { id: string; name: string; imageUrl: string };
type Film = { status: string; stage: string | null; error: string | null; videoUrl: string | null };

const STAGES: Record<string, string> = {
  timing: "Syncing lyrics to the singing",
  scenes: "Planning scenes",
  keyframes: "Drawing scenes",
  clips: "Animating",
  assemble: "Editing the video",
  done: "Finished",
};

export interface MusicVideoPrices {
  premiumAvailable: boolean;
  premiumCreditsPerShot: number;
  cinematicAvailable?: boolean;
  cinematicCreditsPerShot?: number;
  singerCreditsPerShot?: { premium: number; cinematic: number };
}

// Mirrors musicVideoCredits() in src/lib/billing/catalog.ts.
function cost(quality: string, durationSec: number, prices: MusicVideoPrices, singer: boolean) {
  if (quality === "standard") return 2;
  const perShot =
    singer && prices.singerCreditsPerShot
      ? prices.singerCreditsPerShot[quality as "premium" | "cinematic"]
      : quality === "cinematic"
        ? (prices.cinematicCreditsPerShot ?? prices.premiumCreditsPerShot)
        : prices.premiumCreditsPerShot;
  return Math.ceil(durationSec / 5) * perShot;
}

export function MusicVideoPanel({
  songId,
  durationSec,
  characters,
  prices,
}: {
  songId: string;
  durationSec: number;
  characters: Character[];
  prices: MusicVideoPrices;
}) {
  const [style, setStyle] = useState("animated");
  const [quality, setQuality] = useState("standard");
  const [characterId, setCharacterId] = useState("");
  const [kidSafe, setKidSafe] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoConsent, setPhotoConsent] = useState(false);
  const [singer, setSinger] = useState(false);
  const paid = quality !== "standard";
  const credits = cost(quality, durationSec, prices, paid && singer);
  const [filmId, setFilmId] = useState<string | null>(null);
  const [film, setFilm] = useState<Film | null>(null);
  const [error, setError] = useState<{ text: string; needCredits?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!filmId) return;
    const timer = setInterval(async () => {
      const res = await fetch(`/api/films/${filmId}`);
      if (!res.ok) return;
      const next: Film = await res.json();
      setFilm(next);
      if (next.status === "completed" || next.status === "failed") clearInterval(timer);
    }, 4000);
    return () => clearInterval(timer);
  }, [filmId]);

  async function start() {
    if (paid && photo && !photoConsent) return setError({ text: "Tick the box to confirm the person in the photo agreed." });
    setBusy(true);
    setError(null);
    // The photo goes up first; the request names it.
    let photoId: string | undefined;
    if (paid && photo) {
      const form = new FormData();
      form.append("photo", photo);
      const up = await fetch("/api/photos", { method: "POST", body: form });
      const upBody = (await up.json().catch(() => ({}))) as { photo?: string; error?: string };
      if (!up.ok || !upBody.photo) {
        setBusy(false);
        return setError({ text: upBody.error ?? "Couldn't upload your photo" });
      }
      photoId = upBody.photo;
    }
    const res = await fetch(`/api/songs/${songId}/music-video`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        style,
        quality,
        kidSafe,
        singer: paid && singer,
        ...(characterId ? { characterId } : {}),
        ...(photoId ? { photo: photoId, photoConsent } : {}),
      }),
    });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) return setError({ text: body.error, needCredits: body.needCredits });
    setFilmId(body.id);
  }

  if (filmId) {
    return (
      <div className="panel">
        {!film || film.status === "queued" ? (
          <p className="muted">Queued…</p>
        ) : film.status === "failed" ? (
          <p className="muted">Something went wrong: {film.error}. Credits were refunded.</p>
        ) : film.status === "completed" ? (
          <>
            <video src={film.videoUrl!} controls playsInline />
            <p className="muted">
              Saved to <a href="/">My videos</a>. <a href={`/calendar?film=${filmId}`}>Schedule it</a>
            </p>
          </>
        ) : (
          <p className="muted">{STAGES[film.stage ?? ""] ?? "Working"}…</p>
        )}
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="row">
        <div>
          <label htmlFor={`mv-style-${songId}`}>Look</label>
          <select id={`mv-style-${songId}`} value={style} onChange={(e) => setStyle(e.target.value)}>
            <option value="animated">3D cartoon</option>
            <option value="cinematic">Cinematic</option>
            <option value="photoreal">Photoreal</option>
          </select>
        </div>
        <div>
          <label htmlFor={`mv-char-${songId}`}>Star</label>
          <select id={`mv-char-${songId}`} value={characterId} onChange={(e) => setCharacterId(e.target.value)}>
            <option value="">AI picks one</option>
            {characters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>
      {prices.premiumAvailable && (
        <>
          <label htmlFor={`mv-q-${songId}`}>Animation</label>
          <select id={`mv-q-${songId}`} value={quality} onChange={(e) => setQuality(e.target.value)}>
            <option value="standard">Moving pictures · {cost("standard", durationSec, prices, false)} credits</option>
            <option value="premium">AI animation · {cost("premium", durationSec, prices, singer)} credits</option>
            {prices.cinematicAvailable && (
              <option value="cinematic">Cinematic, hyper-real 1080p · {cost("cinematic", durationSec, prices, singer)} credits</option>
            )}
          </select>
        </>
      )}
      {paid && (
        <>
          <label className="check">
            <input type="checkbox" checked={singer} onChange={(e) => setSinger(e.target.checked)} /> Sing it yourself: the star lip-syncs the
            song in every scene
          </label>
          <label htmlFor={`mv-photo-${songId}`}>Star photo (optional)</label>
          <input
            id={`mv-photo-${songId}`}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => {
              setPhoto(e.target.files?.[0] ?? null);
              setPhotoConsent(false);
            }}
          />
          {photo && (
            <label className="check">
              <input type="checkbox" checked={photoConsent} onChange={(e) => setPhotoConsent(e.target.checked)} /> This is me, or this person
              agreed to be in my video
            </label>
          )}
        </>
      )}
      <label className="check">
        <input type="checkbox" checked={kidSafe} onChange={(e) => setKidSafe(e.target.checked)} /> For kids
      </label>
      <p className="muted">Scenes follow the lyrics, with lyric captions synced to the singing.</p>
      <button type="button" onClick={start} disabled={busy}>
        {busy ? "Starting…" : `Make music video · ${credits} credits`}
      </button>
      {error && (
        <p className="muted">
          {error.text} {error.needCredits && <a href="/billing">Get credits</a>}
        </p>
      )}
    </div>
  );
}
