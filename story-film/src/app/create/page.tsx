"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Icon, type IconName } from "../app-shell";
import { EditMoments } from "../edit-moments";
import { Celebrate, Loader, ReelLogo } from "../reel-logo";
import { loadBrand } from "@/lib/brand-prefs";
import { buildClaudePrompt, claudeUrl } from "@/lib/claude-prompt";
import { findLanguage, LANGUAGES } from "@/lib/languages";
import { FILM_STYLES } from "@/lib/styles";

type Mode = "film" | "cartoon" | "motion" | "dance" | "edit";
type Status = {
  id: string;
  status: string;
  stage: string | null;
  title: string | null;
  error: string | null;
  videoUrl: string | null;
  contentCredentials?: boolean;
  format?: string;
};
type Character = { id: string; name: string; description: string; imageUrl: string };
type Idea = { title: string; idea: string };

const TYPES: { mode: Mode; label: string; help: string; icon: IconName }[] = [
  { mode: "cartoon", label: "Cartoon episode", help: "The same character every episode", icon: "cartoon" },
  { mode: "film", label: "Short film", help: "Real-looking scenes and Indian art styles", icon: "film" },
  { mode: "motion", label: "Motion reel", help: "Tips, lists and quotes that move", icon: "motion" },
  { mode: "dance", label: "Kids dance", help: "Cartoon kids dance to a dhol beat", icon: "dance" },
  { mode: "edit", label: "Edit my video", help: "Captions, zooms and effects on your clip", icon: "edit" },
];
const FILM_STATUS: Record<string, string> = { queued: "Queued", running: "Making", review: "Check effects", failed: "Failed" };
const isMode = (v: string | null): v is Mode => TYPES.some((t) => t.mode === v);

const STAGE_LABELS: Record<string, string> = {
  script: "Writing the script",
  keyframes: "Drawing the scenes",
  clips: "Animating",
  audio: "Recording narration",
  assemble: "Editing the video",
  done: "Finished",
};

async function postJson<T>(url: string, body: unknown): Promise<{ ok: boolean; data: T & { error?: string } }> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { ok: res.ok, data: await res.json().catch(() => ({})) };
}

export default function CreatePage() {
  const [mode, setMode] = useState<Mode>("cartoon");
  const [story, setStory] = useState("");
  const [style, setStyle] = useState("cinematic");
  const [durationSec, setDurationSec] = useState(30);
  const [kidSafe, setKidSafe] = useState(true);
  const [niche, setNiche] = useState("");
  const [language, setLanguage] = useState("auto");
  const [languages, setLanguages] = useState<{ code: string; name: string; native: string; available: boolean }[]>(
    LANGUAGES.map((l) => ({ ...l, available: true })),
  );
  const [captions, setCaptions] = useState(true);
  const [quality, setQuality] = useState("standard");
  const [ending, setEnding] = useState("auto");
  const [keyword, setKeyword] = useState("");
  const [video, setVideo] = useState<File | null>(null);
  const [zooms, setZooms] = useState(true);
  const [effects, setEffects] = useState(true);
  const [sounds, setSounds] = useState(true);
  const [voice, setVoice] = useState("natural");
  const [review, setReview] = useState(false);
  const [fineTune, setFineTune] = useState(false);
  // Bumped to restart polling after an edit is sent to render again.
  const [pollKey, setPollKey] = useState(0);
  const [billing, setBilling] = useState<{ balance: number; premiumAvailable: boolean; premiumCreditsPerShot: number; freeLeft?: number; freeVideosPerWeek?: number } | null>(null);
  const [needCredits, setNeedCredits] = useState(false);

  const [characters, setCharacters] = useState<Character[]>([]);
  const [characterId, setCharacterId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [savingCharacter, setSavingCharacter] = useState(false);

  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loadingIdeas, setLoadingIdeas] = useState(false);

  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [canShareFiles, setCanShareFiles] = useState(false);
  const [caption, setCaption] = useState<string | null>(null);
  const [captionFor, setCaptionFor] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [library, setLibrary] = useState<Status[]>([]);

  const loadLibrary = useCallback(() => {
    fetch("/api/films")
      .then((r) => (r.ok ? r.json() : { films: [] }))
      .then((d: { films: Status[] }) => setLibrary(d.films))
      .catch(() => {});
  }, []);

  // Home opens a type directly (/create?mode=edit) or a reel still being made (/create?film=<id>).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const m = params.get("mode");
    if (isMode(m)) setMode(m);
    const film = params.get("film");
    if (film && /^[0-9a-f-]{36}$/i.test(film)) setJobId(film);
  }, []);

  useEffect(() => {
    fetch("/api/characters")
      .then((r) => r.json())
      .then((d: { characters: Character[] }) => {
        setCharacters(d.characters);
        if (d.characters[0]) setCharacterId(d.characters[0].id);
      })
      .catch(() => {});
    const probe = new File([""], "probe.mp4", { type: "video/mp4" });
    setCanShareFiles(typeof navigator.canShare === "function" && navigator.canShare({ files: [probe] }));
    loadLibrary();
    fetch("/api/billing").then(async (r) => r.ok && setBilling(await r.json())).catch(() => {});
    fetch("/api/languages").then(async (r) => r.ok && setLanguages((await r.json()).languages)).catch(() => {});
  }, [loadLibrary]);

  useEffect(() => {
    if (!jobId) return;
    let done = false;
    const tick = async () => {
      const res = await fetch(`/api/films/${jobId}`).catch(() => null);
      if (!res?.ok || done) return;
      const next: Status = await res.json();
      setStatus(next);
      if (next.status === "completed" || next.status === "failed" || next.status === "review") {
        done = true;
        clearInterval(timer);
        loadLibrary();
      }
    };
    const timer = setInterval(tick, 4000);
    tick();
    return () => {
      done = true;
      clearInterval(timer);
    };
  }, [jobId, loadLibrary, pollKey]);

  const rendering = () => {
    setFineTune(false);
    setStatus((s) => (s ? { ...s, status: "queued", stage: null } : s));
    setPollKey((k) => k + 1);
  };

  async function saveCharacter(e: FormEvent) {
    e.preventDefault();
    setSavingCharacter(true);
    setError(null);
    const { ok, data } = await postJson<{ character: Character }>("/api/characters", {
      name: newName,
      description: newDescription,
      style: "animated",
    });
    setSavingCharacter(false);
    if (!ok) return setError(data.error ?? "Couldn't create the character");
    setCharacters((cs) => [...cs, data.character]);
    setCharacterId(data.character.id);
    setCreating(false);
    setNewName("");
    setNewDescription("");
  }

  async function getIdeas() {
    setLoadingIdeas(true);
    setError(null);
    const { ok, data } = await postJson<{ ideas: Idea[] }>("/api/suggestions", {
      niche: niche || undefined,
      characterId: mode === "cartoon" ? characterId ?? undefined : undefined,
      kidSafe: mode === "cartoon" && kidSafe,
      language: language === "auto" ? undefined : findLanguage(language)?.name,
    });
    setLoadingIdeas(false);
    if (!ok) return setError(data.error ?? "Couldn't get ideas");
    setIdeas(data.ideas);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (mode === "cartoon" && !characterId) return setError("Create or pick a character first");
    setSubmitting(true);
    setError(null);
    setNeedCredits(false);
    setStatus(null);
    setCaption(null);
    setCaptionFor(null);
    if (mode === "edit") {
      if (!video) {
        setSubmitting(false);
        return setError("Choose a video to edit");
      }
      const form = new FormData();
      form.append("video", video);
      form.append("language", language);
      form.append("captions", String(captions));
      form.append("zooms", String(zooms));
      form.append("effects", String(effects));
      form.append("sounds", String(sounds));
      form.append("voice", voice);
      form.append("review", String(review));
      form.append("ending", ending);
      if (ending === "comment" && keyword) form.append("keyword", keyword);
      const brand = loadBrand();
      if (brand) form.append("brand", JSON.stringify(brand));
      const res = await fetch("/api/edits", { method: "POST", body: form });
      const body = (await res.json().catch(() => ({}))) as { id?: string; credits?: number; error?: string; needCredits?: boolean };
      setSubmitting(false);
      if (!res.ok || !body.id) {
        setNeedCredits(Boolean(body.needCredits));
        return setError(body.error ?? "Upload failed");
      }
      if (body.credits && billing) setBilling({ ...billing, balance: billing.balance - body.credits });
      return setJobId(body.id);
    }
    const { ok, data } = await postJson<{ id: string; credits: number; needCredits?: boolean }>("/api/films", {
      story,
      durationSec,
      language,
      captions,
      quality,
      ...(mode === "cartoon" ? { style: "animated", characterId, kidSafe } : mode === "motion" ? { style: "animated", format: "motion", ending, keyword: ending === "comment" && keyword ? keyword : undefined, brand: loadBrand() } : mode === "dance" ? { style: "animated", format: "dance", kidSafe: true, brand: loadBrand() } : { style }),
    });
    setSubmitting(false);
    if (!ok) {
      setNeedCredits(Boolean(data.needCredits));
      return setError(data.error ?? "Something went wrong");
    }
    if (data.credits && billing) setBilling({ ...billing, balance: billing.balance - data.credits });
    setJobId(data.id);
  }

  // Opens Claude with a prompt that makes this reel through the Reelkar connector.
  function buildWithClaude() {
    if (mode === "edit") return;
    const lang = language === "auto" ? undefined : findLanguage(language);
    const prompt = buildClaudePrompt({
      type: mode,
      idea: story,
      durationSec,
      language: lang && { code: lang.code, name: lang.name },
      brand: loadBrand(),
      style: mode === "film" ? style : mode === "cartoon" ? "animated" : undefined,
      kidSafe: mode === "dance" || (mode === "cartoon" && kidSafe),
      character: mode === "cartoon" ? characters.find((c) => c.id === characterId) : undefined,
    });
    window.open(claudeUrl(prompt), "_blank", "noopener");
  }

  async function writeCaption(platform: "instagram" | "whatsapp") {
    setCaptionFor(platform);
    setCaption(null);
    setCopied(false);
    const { ok, data } = await postJson<{ text: string }>(`/api/films/${jobId}/copy`, { platform });
    if (!ok) {
      setCaptionFor(null);
      return setError(data.error ?? "Couldn't write a caption");
    }
    setCaption(data.text);
  }

  async function copyCaption() {
    if (!caption) return;
    await navigator.clipboard.writeText(caption).catch(() => {});
    setCopied(true);
  }

  async function share() {
    const blob = await (await fetch(`/api/films/${jobId}/video`)).blob();
    const file = new File([blob], `${status?.title ?? "video"}.mp4`, { type: "video/mp4" });
    // Instagram drops shared text, so the caption also goes on the clipboard to paste.
    if (caption) await copyCaption();
    try {
      await navigator.share({ files: [file], title: status?.title ?? undefined, ...(caption ? { text: caption } : {}) });
    } catch {
      // User closed the share sheet; nothing to do.
    }
  }

  const busy = submitting || (status !== null && status.status !== "completed" && status.status !== "failed" && status.status !== "review");

  return (
    <main>
      <header className="top">
        <div>
          <h1>What are we making today?</h1>
          <p className="sub">Pick a type and tell the story. Reelkar adds the voice, music and captions.</p>
        </div>
      </header>

      <div className="split">
        <section className="create" aria-label="Make a reel">
          <div className="types" role="group" aria-label="What to make">
            {TYPES.map((t) => (
              <button type="button" key={t.mode} className="type" aria-pressed={mode === t.mode} onClick={() => setMode(t.mode)}>
                <i><Icon name={t.icon} size={20} /></i>
                <b>{t.label}</b>
                <span>{t.help}</span>
              </button>
            ))}
          </div>

          {mode === "cartoon" && (
            <section>
              <label>Character</label>
              <div className="characters">
                {characters.map((c) => (
                  <button type="button" key={c.id} className="character" aria-pressed={c.id === characterId} onClick={() => setCharacterId(c.id)}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={c.imageUrl} alt={c.description} />
                    {c.name}
                  </button>
                ))}
                <button type="button" className="character add" onClick={() => setCreating((v) => !v)}>+ New</button>
              </div>
              {creating && (
                <form className="panel" onSubmit={saveCharacter}>
                  <label htmlFor="cname">Name</label>
                  <input id="cname" type="text" value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={40} required />
                  <label htmlFor="cdesc">Looks like</label>
                  <input
                    id="cdesc"
                    type="text"
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder="e.g. cheerful 3-year-old girl, curly bun, yellow raincoat"
                    minLength={10}
                    maxLength={300}
                    required
                  />
                  <div className="actions">
                    <button type="submit" disabled={savingCharacter}>{savingCharacter ? "Drawing…" : "Create character"}</button>
                  </div>
                </form>
              )}
              <label className="check">
                <input type="checkbox" checked={kidSafe} onChange={(e) => setKidSafe(e.target.checked)} /> Made for kids
              </label>
            </section>
          )}

          <form onSubmit={submit}>
            <label htmlFor="niche">Need ideas?</label>
            <div className="row">
              <input id="niche" type="text" value={niche} onChange={(e) => setNiche(e.target.value)} placeholder="Your topic, e.g. learning English words" />
              <button type="button" className="secondary" onClick={getIdeas} disabled={loadingIdeas} style={{ flex: "0 0 auto", width: "auto" }}>
                {loadingIdeas ? "Thinking…" : "Suggest"}
              </button>
            </div>
            {ideas.length > 0 && (
              <div className="ideas">
                {ideas.map((i) => (
                  <button type="button" key={i.title} title={i.idea} onClick={() => setStory(i.idea)}>{i.title}</button>
                ))}
              </div>
            )}

            {mode === "edit" && (
              <>
                <p className="muted">Upload a video you filmed (up to 60 seconds). We add captions in your language, zooms on key moments, cards for your main points and effects that know where you are in the frame.</p>
                <label htmlFor="video">Your video</label>
                <input id="video" type="file" accept="video/mp4,video/quicktime,video/webm" onChange={(e) => setVideo(e.target.files?.[0] ?? null)} />
                <label className="check">
                  <input type="checkbox" checked={zooms} onChange={(e) => setZooms(e.target.checked)} /> Zoom in on key moments
                </label>
                <label className="check">
                  <input type="checkbox" checked={effects} onChange={(e) => setEffects(e.target.checked)} /> Effects around you: a word behind you, spotlight, sticker, stamps
                </label>
                <label className="check">
                  <input type="checkbox" checked={sounds} onChange={(e) => setSounds(e.target.checked)} /> Sound effects
                </label>
                <label htmlFor="voice">Your voice</label>
                <select id="voice" value={voice} onChange={(e) => setVoice(e.target.value)}>
                  <option value="natural">As recorded</option>
                  <option value="clear">Clear: less noise, even volume</option>
                  <option value="deeper">Deeper and fuller</option>
                </select>
                <label className="check">
                  <input type="checkbox" checked={review} onChange={(e) => setReview(e.target.checked)} /> Let me check the effects before rendering
                </label>
              </>
            )}
            {(mode === "motion" || mode === "edit") && (
              <>
                {mode === "motion" && <p className="muted">Animated text and graphics with a voice-over: tips, lists, numbers, charts and quotes. Uses your free weekly reels, no AI animation credits.</p>}
                <div className="row">
                  <div>
                    <label htmlFor="ending">Ending</label>
                    <select id="ending" value={ending} onChange={(e) => setEnding(e.target.value)}>
                      <option value="auto">Let AI decide</option>
                      <option value="none">No ending ask</option>
                      <option value="follow">Ask to follow</option>
                      <option value="comment">Ask to comment a word</option>
                    </select>
                  </div>
                  {ending === "comment" && (
                    <div>
                      <label htmlFor="keyword">Word to comment</label>
                      <input id="keyword" value={keyword} maxLength={20} placeholder="GUIDE" onChange={(e) => setKeyword(e.target.value.replace(/\s/g, "").toUpperCase())} />
                    </div>
                  )}
                </div>
              </>
            )}
            {mode === "dance" && <p className="muted">Cartoon kids dance to a dhol beat while a voice chants a catchy rhyme, with bouncing captions. Drawn by Reelkar, so it uses your free weekly reels and no AI animation credits.</p>}
            {mode !== "edit" && (
              <>
                <label htmlFor="story">{mode === "cartoon" ? "What happens in this episode?" : mode === "motion" ? "What is the reel about?" : mode === "dance" ? "What is the dance about? (e.g. a rain dance, counting to five, brushing teeth)" : "Your story"}</label>
                <textarea id="story" value={story} onChange={(e) => setStory(e.target.value)} minLength={20} required />
              </>
            )}
            <div className="row">
              {mode === "film" && (
                <div>
                  <label htmlFor="style">Style</label>
                  <select id="style" value={style} onChange={(e) => setStyle(e.target.value)}>
                    <optgroup label="Looks">
                      {FILM_STYLES.filter((s) => s.group === "look").map((s) => (
                        <option key={s.id} value={s.id}>{s.label}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Indian art">
                      {FILM_STYLES.filter((s) => s.group === "indian").map((s) => (
                        <option key={s.id} value={s.id}>{s.label}</option>
                      ))}
                    </optgroup>
                  </select>
                </div>
              )}
              <div>
                <label htmlFor="language">Narration</label>
                <select id="language" value={language} onChange={(e) => setLanguage(e.target.value)}>
                  <option value="auto">Same as my text</option>
                  {languages.map((l) => (
                    <option key={l.code} value={l.code} disabled={!l.available}>
                      {l.native === l.name ? l.name : `${l.native} (${l.name})`}{l.available ? "" : " · coming soon"}
                    </option>
                  ))}
                </select>
              </div>
              <div hidden={mode === "edit"}>
                <label htmlFor="duration">Length</label>
                <select id="duration" value={durationSec} onChange={(e) => setDurationSec(Number(e.target.value))}>
                  <option value={15}>15 seconds</option>
                  <option value={30}>30 seconds</option>
                  <option value={60}>60 seconds</option>
                </select>
              </div>
            </div>
            {billing?.premiumAvailable && mode !== "motion" && mode !== "dance" && mode !== "edit" && (
              <>
                <label htmlFor="quality">Animation</label>
                <select id="quality" value={quality} onChange={(e) => setQuality(e.target.value)}>
                  <option value="standard">Standard: moving pictures (free weekly)</option>
                  <option value="premium">
                    AI animation: {Math.round(durationSec / 5) * billing.premiumCreditsPerShot} credits
                  </option>
                </select>
              </>
            )}
            {mode !== "motion" && (
              <label className="check">
                <input type="checkbox" checked={captions} onChange={(e) => setCaptions(e.target.checked)} /> Captions on video
              </label>
            )}
            <p className="muted">Free plan: a few videos per week, 720p, labelled “Created with AI”.</p>
            <div className="actions make-actions">
              <button type="submit" disabled={busy}>{busy ? "Working…" : mode === "cartoon" ? "Make episode" : mode === "motion" ? "Make my reel" : mode === "dance" ? "Make the dance" : mode === "edit" ? "Edit my video" : "Make my film"}</button>
              {mode !== "edit" && (
                <button type="button" className="secondary" onClick={buildWithClaude}>Build with Claude</button>
              )}
            </div>
            {mode !== "edit" && (
              <p className="muted">Needs the Reelkar connector in Claude. Set it up in <a href="/connect">Connect AI</a></p>
            )}
          </form>
        </section>

        <aside>
          {!jobId && (
            <section className="card summary" aria-labelledby="summary-title">
              <h2 id="summary-title">This reel</h2>
              <dl>
                <div><dt>Type</dt><dd>{TYPES.find((t) => t.mode === mode)?.label}</dd></div>
                {mode !== "edit" && <div><dt>Length</dt><dd>{durationSec} seconds</dd></div>}
                <div><dt>Narration</dt><dd>{language === "auto" ? "Same as my text" : findLanguage(language)?.name ?? language}</dd></div>
                <div>
                  <dt>Cost</dt>
                  <dd>
                    {quality === "premium" && mode !== "motion" && mode !== "dance" && mode !== "edit" && billing
                      ? `${Math.round(durationSec / 5) * billing.premiumCreditsPerShot} credits`
                      : billing?.freeLeft === 0
                        ? "1 credit (free reels used)"
                        : billing?.freeLeft !== undefined
                          ? `Free · ${billing.freeLeft} left this week`
                          : "Free weekly reel"}
                  </dd>
                </div>
              </dl>
            </section>
          )}

          {error && (
            <div className="status error-box" role="alert">
              {error} {needCredits && <a href="/billing">Get credits</a>}
            </div>
          )}
          {jobId && (
            <div className="status">
              {!status || status.status === "queued" ? (
                <Loader label="Queued…" />
              ) : status.status === "failed" ? (
                <p>
                  <strong>{status.title ?? "This reel"} didn&apos;t finish.</strong> {status.error || "Please try making it again."}
                </p>
              ) : status.status === "review" ? (
                <EditMoments filmId={jobId} onRendering={rendering} />
              ) : status.status === "completed" ? (
                <>
                  <strong>{status.title}</strong>
                  {status.contentCredentials && (
                    <p className="muted cc">
                      <span className="cc-badge">cr</span> Content Credentials: marked as AI-generated ·{" "}
                      <a href="https://contentcredentials.org/verify" target="_blank" rel="noreferrer">verify</a>
                    </p>
                  )}
                  {status.error && <p className="muted">{status.error}</p>}
                  <Celebrate key={pollKey}>
                    <video src={`/api/films/${jobId}/video?v=${pollKey}`} controls playsInline />
                  </Celebrate>
                  {status.format === "edit" &&
                    (fineTune ? (
                      <EditMoments filmId={jobId} onRendering={rendering} />
                    ) : (
                      <div className="actions">
                        <button type="button" className="secondary" onClick={() => setFineTune(true)}>Fine-tune effects</button>
                      </div>
                    ))}
                  <div className="actions">
                    {canShareFiles && <button type="button" onClick={share}>Share</button>}
                    <a href={`/api/films/${jobId}/video`} download>
                      <button type="button" className="secondary">Download</button>
                    </a>
                  </div>
                  <div className="actions">
                    <button type="button" className="secondary" onClick={() => writeCaption("instagram")}>✨ Instagram caption</button>
                    <button type="button" className="secondary" onClick={() => writeCaption("whatsapp")}>✨ WhatsApp message</button>
                  </div>
                  {captionFor && (
                    <div className="panel">
                      {caption === null ? (
                        <p className="muted">Writing…</p>
                      ) : (
                        <>
                          <textarea value={caption} onChange={(e) => setCaption(e.target.value)} style={{ minHeight: 200 }} />
                          <div className="actions">
                            <button type="button" className="secondary" onClick={copyCaption}>{copied ? "Copied" : "Copy"}</button>
                            <button type="button" className="secondary" onClick={() => writeCaption(captionFor as "instagram" | "whatsapp")}>Try again</button>
                          </div>
                          {canShareFiles && <p className="muted">Tapping Share also copies this caption, so you can paste it in Instagram.</p>}
                        </>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <Loader long label={`${STAGE_LABELS[status.stage ?? ""] ?? "Working"}…`} />
              )}
            </div>
          )}

          <section>
            <h2>My videos</h2>
            {library.length === 0 ? (
              <div className="empty">
                <ReelLogo size={48} />
                <p>Your finished videos will show up here.</p>
              </div>
            ) : (
              <div className="library">
                {library.map((f) => (
                  <div key={f.id} className="post">
                    <a className="reel-row" href={f.videoUrl ?? "#"} onClick={(e) => !f.videoUrl && e.preventDefault()}>
                      <span className="thumb" aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                      </span>
                      {f.title ?? "Untitled"}
                    </a>
                    {f.status === "completed" ? (
                      <a href={`/calendar?film=${f.id}`}>Schedule</a>
                    ) : (
                      <span className={`pill pill-${f.status}`}>{FILM_STATUS[f.status] ?? f.status}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
        </section>
        </aside>
      </div>
    </main>
  );
}
