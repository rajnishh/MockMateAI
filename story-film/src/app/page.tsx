"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";

type Mode = "film" | "cartoon";
type Status = { id: string; status: string; stage: string | null; title: string | null; error: string | null; videoUrl: string | null };
type Character = { id: string; name: string; description: string; imageUrl: string };
type Idea = { title: string; idea: string };

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
  return { ok: res.ok, data: await res.json() };
}

export default function Home() {
  const [mode, setMode] = useState<Mode>("cartoon");
  const [story, setStory] = useState("");
  const [style, setStyle] = useState("cinematic");
  const [durationSec, setDurationSec] = useState(30);
  const [kidSafe, setKidSafe] = useState(true);
  const [niche, setNiche] = useState("");

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
  const [library, setLibrary] = useState<Status[]>([]);
  const { data: session } = authClient.useSession();

  const loadLibrary = useCallback(() => {
    fetch("/api/films")
      .then((r) => (r.ok ? r.json() : { films: [] }))
      .then((d: { films: Status[] }) => setLibrary(d.films))
      .catch(() => {});
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
  }, [loadLibrary]);

  useEffect(() => {
    if (!jobId) return;
    const timer = setInterval(async () => {
      const res = await fetch(`/api/films/${jobId}`);
      if (!res.ok) return;
      const next: Status = await res.json();
      setStatus(next);
      if (next.status === "completed" || next.status === "failed") {
        clearInterval(timer);
        loadLibrary();
      }
    }, 4000);
    return () => clearInterval(timer);
  }, [jobId, loadLibrary]);

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
    setStatus(null);
    const { ok, data } = await postJson<{ id: string }>("/api/films", {
      story,
      durationSec,
      ...(mode === "cartoon" ? { style: "animated", characterId, kidSafe } : { style }),
    });
    setSubmitting(false);
    if (!ok) return setError(data.error ?? "Something went wrong");
    setJobId(data.id);
  }

  async function share() {
    const blob = await (await fetch(`/api/films/${jobId}/video`)).blob();
    const file = new File([blob], `${status?.title ?? "video"}.mp4`, { type: "video/mp4" });
    try {
      await navigator.share({ files: [file], title: status?.title ?? undefined });
    } catch {
      // User closed the share sheet; nothing to do.
    }
  }

  const busy = submitting || (status !== null && status.status !== "completed" && status.status !== "failed");

  async function signOut() {
    await authClient.signOut();
    window.location.href = "/login";
  }

  return (
    <main>
      <header className="top">
        <h1>Story to Film</h1>
        <button type="button" className="secondary" onClick={signOut}>Sign out</button>
      </header>
      {session && <p className="muted">Signed in as {session.user.phoneNumber ?? session.user.email}</p>}
      <p className="muted">Make cartoon episodes and short films for Reels, Shorts and WhatsApp.</p>

      <div className="tabs" role="group" aria-label="What to make">
        <button type="button" aria-pressed={mode === "cartoon"} onClick={() => setMode("cartoon")}>Cartoon episode</button>
        <button type="button" aria-pressed={mode === "film"} onClick={() => setMode("film")}>Short film</button>
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

        <label htmlFor="story">{mode === "cartoon" ? "What happens in this episode?" : "Your story"}</label>
        <textarea id="story" value={story} onChange={(e) => setStory(e.target.value)} minLength={20} required />
        <div className="row">
          {mode === "film" && (
            <div>
              <label htmlFor="style">Style</label>
              <select id="style" value={style} onChange={(e) => setStyle(e.target.value)}>
                <option value="cinematic">Cinematic</option>
                <option value="animated">Animated</option>
                <option value="photoreal">Photoreal</option>
              </select>
            </div>
          )}
          <div>
            <label htmlFor="duration">Length</label>
            <select id="duration" value={durationSec} onChange={(e) => setDurationSec(Number(e.target.value))}>
              <option value={15}>15 seconds</option>
              <option value={30}>30 seconds</option>
              <option value={60}>60 seconds</option>
            </select>
          </div>
        </div>
        <p className="muted">Free plan: a few videos per week, 720p, labelled “Created with AI”.</p>
        <button type="submit" disabled={busy}>{busy ? "Working…" : mode === "cartoon" ? "Make episode" : "Make my film"}</button>
      </form>

      {error && <div className="status">{error}</div>}
      {jobId && (
        <div className="status">
          {!status || status.status === "queued" ? (
            <p>Queued…</p>
          ) : status.status === "failed" ? (
            <p>Something went wrong: {status.error}</p>
          ) : status.status === "completed" ? (
            <>
              <strong>{status.title}</strong>
              <video src={`/api/films/${jobId}/video`} controls playsInline />
              <div className="actions">
                {canShareFiles && <button type="button" onClick={share}>Share</button>}
                <a href={`/api/films/${jobId}/video`} download>
                  <button type="button" className="secondary">Download</button>
                </a>
              </div>
            </>
          ) : (
            <p>{STAGE_LABELS[status.stage ?? ""] ?? "Working"}…</p>
          )}
        </div>
      )}

      {library.length > 0 && (
        <section>
          <h2>My videos</h2>
          <div className="library">
            {library.map((f) => (
              <a key={f.id} href={f.videoUrl ?? "#"} onClick={(e) => !f.videoUrl && e.preventDefault()}>
                <span>{f.title ?? "Untitled"}</span>
                <span className="muted">{f.status}</span>
              </a>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
