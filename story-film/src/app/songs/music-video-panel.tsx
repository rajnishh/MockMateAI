"use client";

import { useCallback, useEffect, useState } from "react";

type Character = { id: string; name: string; imageUrl: string };
type Kind = "lyric" | "story" | "performance" | "full";
type ShotType = "sing" | "dance" | "scene" | "lyric";
type KindOption = { kind: Kind; available: boolean; credits: number; creditsPer5s: number | null };
type Options = { durationSec: number; kinds: KindOption[]; danceStyles: { id: string; label: string }[] };
type Shot = { start: number; end: number; type: ShotType; lines: string[]; imagePrompt: string; frameUrl: string | null };
type Board = {
  kind: Kind;
  duration: number;
  bpm: number;
  credits: number;
  star: { description: string; imageUrl: string | null } | null;
  shotTypes: ShotType[];
  redrawsLeft: number;
  shots: Shot[];
};
type Video = { status: string; stage: string | null; error: string | null; videoUrl: string | null; storyboard: Board | null };

const KINDS: Record<Kind, { title: string; line: string; icon: string }> = {
  lyric: { title: "Lyric video", line: "Moving art and big words on the beat", icon: "Aa" },
  story: { title: "Story video", line: "AI scenes act out the lyrics, same star throughout", icon: "🎞" },
  performance: { title: "Performance", line: "Your star sings to camera, lips in sync", icon: "🎤" },
  full: { title: "Full music video", line: "Sings, dances and acts out the song, cut on the beat", icon: "✨" },
};

const SHOT_LABEL: Record<ShotType, string> = { sing: "🎤 Sing", dance: "💃 Dance", scene: "🎞 Scene", lyric: "Aa Lyric" };

const STAGES: Record<string, string> = {
  timing: "Syncing lyrics to the singing",
  beats: "Finding the beat",
  scenes: "Planning the shots",
  keyframes: "Drawing the shots",
  stems: "Taking out the vocals",
  clips: "Filming: singing, dancing and scenes",
  assemble: "Cutting it to the beat",
  done: "Finished",
};

const LENGTHS = [
  { label: "15 s", seconds: 15 },
  { label: "30 s", seconds: 30 },
  { label: "Whole song", seconds: 0 },
];

// Kept for the songs page, which passes its billing prices; prices now come from this song's own options.
export interface MusicVideoPrices {
  premiumAvailable: boolean;
  premiumCreditsPerShot: number;
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

export function MusicVideoPanel({ songId, durationSec, characters }: { songId: string; durationSec: number; characters: Character[]; prices?: MusicVideoPrices }) {
  const [kind, setKind] = useState<Kind>("full");
  const [lengthSec, setLengthSec] = useState(durationSec > 30 ? 30 : 0);
  const [startSec, setStartSec] = useState(0);
  const [options, setOptions] = useState<Options | null>(null);
  const [style, setStyle] = useState("photoreal");
  const [characterId, setCharacterId] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoConsent, setPhotoConsent] = useState(false);
  const [danceStyle, setDanceStyle] = useState("bollywood");
  const [danceClip, setDanceClip] = useState<File | null>(null);
  const [danceConsent, setDanceConsent] = useState(false);
  const [kidSafe, setKidSafe] = useState(false);
  const [captions, setCaptions] = useState(true);
  const [filmId, setFilmId] = useState<string | null>(null);
  const [video, setVideo] = useState<Video | null>(null);
  const [shots, setShots] = useState<Shot[]>([]);
  const [error, setError] = useState<{ text: string; needCredits?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  // Bumped when the render starts, so polling picks up again after the storyboard.
  const [pollKey, setPollKey] = useState(0);

  const length = lengthSec && lengthSec < durationSec ? lengthSec : durationSec;
  const start = Math.min(startSec, Math.max(0, durationSec - length));

  useEffect(() => {
    fetch(`/api/songs/${songId}/music-video?seconds=${length}`)
      .then(async (r) => r.ok && setOptions(await r.json()))
      .catch(() => {});
  }, [songId, length]);

  const poll = useCallback(async (id: string) => {
    const res = await fetch(`/api/songs/${songId}/music-video/${id}`);
    if (!res.ok) return null;
    const next: Video = await res.json();
    setVideo(next);
    if (next.storyboard) setShots(next.storyboard.shots);
    return next;
  }, [songId]);

  useEffect(() => {
    if (!filmId) return;
    const timer = setInterval(async () => {
      const next = await poll(filmId);
      if (next && ["review", "completed", "failed"].includes(next.status)) clearInterval(timer);
    }, 3000);
    return () => clearInterval(timer);
  }, [filmId, pollKey, poll]);

  const chosen = options?.kinds.find((k) => k.kind === kind);
  const starred = kind !== "lyric";

  async function upload(url: string, field: string, file: File, extra: Record<string, string> = {}) {
    const form = new FormData();
    form.append(field, file);
    for (const [k, v] of Object.entries(extra)) form.append(k, v);
    const res = await fetch(url, { method: "POST", body: form });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? "Upload failed");
    return body;
  }

  async function storyboard() {
    if (starred && photo && !photoConsent) return setError({ text: "Tick the box to confirm the person in the photo agreed." });
    if (kind === "full" && danceClip && !danceConsent) return setError({ text: "Tick the box to confirm the dancer in the clip agreed." });
    setBusy(true);
    setError(null);
    try {
      const photoId = starred && photo ? (await upload("/api/photos", "photo", photo)).photo : undefined;
      const clipId = kind === "full" && danceClip ? (await upload(`/api/songs/${songId}/music-video/dance-clip`, "clip", danceClip, { consent: "true" })).danceClip : undefined;
      const res = await fetch(`/api/songs/${songId}/music-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          style,
          kidSafe,
          captions,
          storyboard: true,
          danceStyle,
          range: { start, end: start + length },
          ...(starred && characterId ? { characterId } : {}),
          ...(photoId ? { photo: photoId, photoConsent } : {}),
          ...(clipId ? { danceClip: clipId, danceClipConsent: danceConsent } : {}),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw Object.assign(new Error(body.error), { needCredits: body.needCredits });
      setVideo({ status: "queued", stage: null, error: null, videoUrl: null, storyboard: null });
      setFilmId(body.id);
    } catch (err) {
      setError({ text: (err as Error).message, needCredits: (err as { needCredits?: boolean }).needCredits });
    } finally {
      setBusy(false);
    }
  }

  async function saveShots(redraw: number[] = []) {
    if (!filmId) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/songs/${songId}/music-video/${filmId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shots: shots.map((s, i) => ({ type: s.type, imagePrompt: s.imagePrompt, redraw: redraw.includes(i) })) }),
    });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) return setError({ text: body.error });
    setVideo((v) => (v ? { ...v, storyboard: body.storyboard } : v));
    setShots(body.storyboard.shots);
    if (body.blocked) setError({ text: "A picture was blocked by the safety filter; change its words and try again." });
  }

  async function render() {
    if (!filmId) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/songs/${songId}/music-video/${filmId}`, { method: "POST" });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) return setError({ text: body.error, needCredits: body.needCredits });
    setVideo((v) => (v ? { ...v, status: "queued", stage: null } : v));
    setPollKey((k) => k + 1);
  }

  const board = video?.storyboard;
  const changed = board ? shots.some((s, i) => s.type !== board.shots[i]?.type || s.imagePrompt !== board.shots[i]?.imagePrompt) : false;

  return (
    <div className="panel mv">
      <style>{CSS}</style>
      {error && (
        <p className="mv-error" role="alert">
          {error.text} {error.needCredits && <a href="/billing">Get credits</a>}
        </p>
      )}

      {!filmId ? (
        <>
          <div className="mv-kinds" role="radiogroup" aria-label="Kind of music video">
            {(Object.keys(KINDS) as Kind[]).map((k) => {
              const o = options?.kinds.find((x) => x.kind === k);
              return (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={kind === k}
                  disabled={o ? !o.available : false}
                  className={`mv-kind${kind === k ? " on" : ""}`}
                  onClick={() => setKind(k)}
                >
                  <span className="mv-icon" aria-hidden>{KINDS[k].icon}</span>
                  <b>{KINDS[k].title}</b>
                  <span className="muted">{KINDS[k].line}</span>
                  <span className="mv-price">{o ? (o.available ? `${o.credits} credits` : "Coming soon") : "…"}</span>
                </button>
              );
            })}
          </div>

          <fieldset className="mv-group">
            <legend>Length</legend>
            <div className="mv-chips">
              {LENGTHS.filter((l) => !l.seconds || l.seconds < durationSec).map((l) => (
                <button key={l.label} type="button" className={`mv-chip${lengthSec === l.seconds ? " on" : ""}`} aria-pressed={lengthSec === l.seconds} onClick={() => setLengthSec(l.seconds)}>
                  {l.label}
                </button>
              ))}
            </div>
            {length < durationSec && (
              <label className="mv-range">
                Starts at {fmt(start)} · ends {fmt(start + length)}
                <input type="range" min={0} max={Math.max(0, durationSec - length)} step={1} value={start} onChange={(e) => setStartSec(Number(e.target.value))} />
              </label>
            )}
          </fieldset>

          {kind === "full" && options && (
            <fieldset className="mv-group">
              <legend>Dance style</legend>
              <div className="mv-chips">
                {options.danceStyles.map((d) => (
                  <button key={d.id} type="button" className={`mv-chip${danceStyle === d.id && !danceClip ? " on" : ""}`} aria-pressed={danceStyle === d.id && !danceClip} onClick={() => { setDanceStyle(d.id); setDanceClip(null); }}>
                    {d.label}
                  </button>
                ))}
              </div>
              <label htmlFor={`mv-clip-${songId}`}>Or copy your own moves: a 5–10 s clip of you dancing, whole body in view</label>
              <input id={`mv-clip-${songId}`} type="file" accept="video/mp4,video/quicktime" onChange={(e) => { setDanceClip(e.target.files?.[0] ?? null); setDanceConsent(false); }} />
              {danceClip && (
                <label className="check">
                  <input type="checkbox" checked={danceConsent} onChange={(e) => setDanceConsent(e.target.checked)} /> This is me dancing, or the dancer agreed to have their moves copied
                </label>
              )}
            </fieldset>
          )}

          <div className="row">
            <div>
              <label htmlFor={`mv-style-${songId}`}>Look</label>
              <select id={`mv-style-${songId}`} value={style} onChange={(e) => setStyle(e.target.value)}>
                <option value="photoreal">Photoreal</option>
                <option value="cinematic">Cinematic</option>
                <option value="animated">3D cartoon</option>
              </select>
            </div>
            {starred && (
              <div>
                <label htmlFor={`mv-char-${songId}`}>Star</label>
                <select id={`mv-char-${songId}`} value={characterId} onChange={(e) => setCharacterId(e.target.value)}>
                  <option value="">AI picks one</option>
                  {characters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}
          </div>
          {starred && (
            <>
              <label htmlFor={`mv-photo-${songId}`}>Star in it yourself (optional photo)</label>
              <input id={`mv-photo-${songId}`} type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => { setPhoto(e.target.files?.[0] ?? null); setPhotoConsent(false); }} />
              {photo && (
                <label className="check">
                  <input type="checkbox" checked={photoConsent} onChange={(e) => setPhotoConsent(e.target.checked)} /> This is me, or this person agreed to be in my video
                </label>
              )}
            </>
          )}
          <label className="check">
            <input type="checkbox" checked={captions} onChange={(e) => setCaptions(e.target.checked)} /> Lyrics on screen
          </label>
          <label className="check">
            <input type="checkbox" checked={kidSafe} onChange={(e) => setKidSafe(e.target.checked)} /> For kids
          </label>
          <button type="button" onClick={storyboard} disabled={busy || !chosen?.available}>
            {busy ? "Starting…" : "Preview storyboard · free"}
          </button>
          <p className="muted">
            You see every shot first and can change it. You pay {chosen ? `${chosen.credits} credits` : "the price above"} only when you make the video; it&apos;s refunded if it fails.
          </p>
        </>
      ) : !video || video.status === "queued" || video.status === "running" ? (
        <div className="mv-progress" aria-live="polite">
          <span className="loader" aria-hidden />
          <b>{STAGES[video?.stage ?? ""] ?? (board ? "Waiting to start filming" : "Waiting to start")}…</b>
          <span className="muted">{board ? "Filming takes a few minutes. You can leave this page; it's saved to My videos." : "Planning your storyboard: about a minute."}</span>
        </div>
      ) : video.status === "failed" ? (
        <p className="mv-error">Something went wrong: {video.error}. {board ? "Credits were refunded." : ""}</p>
      ) : video.status === "completed" ? (
        <>
          <video src={video.videoUrl!} controls playsInline className="mv-video" />
          <p className="muted">
            Saved to <a href="/">My videos</a>. <a href={`/calendar?film=${filmId}`}>Schedule it</a>
          </p>
        </>
      ) : board ? (
        <>
          <div className="mv-board-head">
            <div>
              <b>{KINDS[board.kind].title} · storyboard</b>
              <span className="muted">
                {board.shots.length} shots · {fmt(board.duration)} · {board.bpm} BPM, cut on the beat
              </span>
            </div>
            {board.star?.imageUrl && (
              <figure className="mv-star">
                <img src={board.star.imageUrl} alt={`Your star: ${board.star.description}`} />
                <figcaption>Your star</figcaption>
              </figure>
            )}
          </div>
          <ol className="mv-shots">
            {shots.map((s, i) => (
              <li key={i} className="mv-shot">
                <div className="mv-frame">
                  {board.shots[i]?.frameUrl ? <img src={board.shots[i].frameUrl!} alt={`Shot ${i + 1}`} /> : <span className="muted">Drawn when you make it</span>}
                  <span className={`mv-tag mv-${s.type}`}>{SHOT_LABEL[s.type]}</span>
                </div>
                <span className="muted mv-time">{fmt(s.start)}–{fmt(s.end)}</span>
                {s.lines.length > 0 && <q className="mv-lines">{s.lines.join(" / ")}</q>}
                {board.shotTypes.length > 1 && (
                  <select aria-label={`Shot ${i + 1} type`} value={s.type} onChange={(e) => setShots(shots.map((x, j) => (j === i ? { ...x, type: e.target.value as ShotType } : x)))}>
                    {board.shotTypes.map((t) => <option key={t} value={t}>{SHOT_LABEL[t]}</option>)}
                  </select>
                )}
                <textarea aria-label={`Shot ${i + 1} picture`} rows={3} value={s.imagePrompt} onChange={(e) => setShots(shots.map((x, j) => (j === i ? { ...x, imagePrompt: e.target.value } : x)))} />
                <button type="button" className="secondary" disabled={busy || board.redrawsLeft === 0} onClick={() => saveShots([i])}>
                  Redraw
                </button>
              </li>
            ))}
          </ol>
          <p className="muted">{board.redrawsLeft} free redraws left. Changed shots are drawn again.</p>
          <div className="mv-actions">
            {changed && (
              <button type="button" className="secondary" disabled={busy} onClick={() => saveShots()}>
                Save changes
              </button>
            )}
            <button type="button" disabled={busy || changed} onClick={render}>
              {busy ? "Working…" : `Make music video · ${board.credits} credits`}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

const CSS = `
.mv { display: grid; gap: 14px; }
.mv-kinds { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
.mv-kind { display: grid; gap: 4px; align-content: start; text-align: left; min-height: 132px; padding: 14px; border-radius: 16px;
  background: var(--surface-raised); color: var(--ink); border: 2px solid var(--line); box-shadow: var(--shadow); cursor: pointer; font: inherit; }
.mv-kind:hover:not(:disabled) { border-color: var(--line-strong); }
.mv-kind.on { border-color: var(--action); background: var(--coral-tint); }
.mv-kind:disabled { opacity: .5; cursor: not-allowed; }
.mv-kind b { font-family: var(--font-display); font-size: 1.05rem; }
.mv-kind .muted { font-size: .85rem; line-height: 1.3; }
.mv-icon { font-size: 1.4rem; }
.mv-price { margin-top: auto; justify-self: start; padding: 3px 10px; border-radius: 999px; background: var(--pop); color: var(--on-pop); font-weight: 700; font-size: .85rem; }
.mv-group { border: 0; padding: 0; margin: 0; display: grid; gap: 8px; }
.mv-group legend { font-weight: 600; margin-bottom: 6px; }
.mv-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.mv-chip { min-height: 44px; padding: 0 16px; border-radius: 999px; border: 1.5px solid var(--line-strong); background: transparent; color: var(--ink); font: inherit; cursor: pointer; }
.mv-chip.on { background: var(--deep); color: var(--on-deep); border-color: var(--deep); }
.mv-range { display: grid; gap: 6px; font-size: .9rem; }
.mv-error { color: var(--danger); font-weight: 600; }
.mv-progress { display: grid; gap: 6px; justify-items: center; text-align: center; padding: 24px 8px; }
.mv-video { width: 100%; max-width: 360px; border-radius: 16px; background: #000; }
.mv-board-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.mv-board-head > div { display: grid; gap: 2px; }
.mv-star { margin: 0; text-align: center; font-size: .8rem; }
.mv-star img { width: 64px; height: 64px; object-fit: cover; border-radius: 50%; border: 3px solid var(--pop); display: block; }
.mv-shots { list-style: none; padding: 0; margin: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 12px; }
.mv-shot { display: grid; gap: 6px; align-content: start; }
.mv-frame { position: relative; aspect-ratio: 9 / 16; border-radius: 12px; overflow: hidden; background: var(--surface-sunken); display: grid; place-items: center; }
.mv-frame img { width: 100%; height: 100%; object-fit: cover; }
.mv-tag { position: absolute; left: 8px; top: 8px; padding: 2px 8px; border-radius: 999px; font-size: .78rem; font-weight: 700; }
.mv-sing { background: var(--pop); color: var(--on-pop); }
.mv-dance { background: var(--teal); color: var(--on-teal); }
.mv-scene, .mv-lyric { background: var(--deep); color: var(--on-deep); }
.mv-time { font-size: .8rem; }
.mv-lines { font-size: .85rem; font-style: italic; }
.mv-shot textarea { font-size: .85rem; }
.mv-actions { display: flex; flex-wrap: wrap; gap: 10px; }
`;
