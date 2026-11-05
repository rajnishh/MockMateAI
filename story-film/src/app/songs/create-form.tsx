"use client";

import { type DragEvent, type FormEvent, useState } from "react";
import { LANGUAGES } from "@/lib/languages";
import { BPM_MAX, BPM_MIN, EXPERIMENT_DEFAULT, KEY_SCALES, slowStyle, STYLE_STRICTNESS_DEFAULT } from "@/lib/songs/controls";
import {
  addSection,
  blocksOf,
  insertRap,
  moveSection,
  onlyTags,
  removeSection,
  SECTION_KINDS,
  type SectionKind,
  setSinger,
  type Singer,
  structureOf,
} from "@/lib/songs/structure";
import { FEATURED_GENRES, GENRES, MOODS, STYLE_CHIPS } from "@/lib/songs/styles";
import css from "./create-form.module.css";

type Mode = "simple" | "custom" | "instrumental";

async function postJson<T>(url: string, body: unknown): Promise<{ ok: boolean; data: T & { error?: string; needCredits?: boolean } }> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { ok: res.ok, data: await res.json().catch(() => ({})) };
}

// The Style chips: Indian and Gulf presets first, then the rest.
const STYLE_PRESETS = [...FEATURED_GENRES.map((id) => GENRES.find((g) => g.id === id)!), ...GENRES.filter((g) => !FEATURED_GENRES.includes(g.id))];

const BLOCK_DOT: Record<SectionKind, string> = {
  Intro: "#c2a9b8",
  Verse: "#ffb21a",
  "Pre-Chorus": "#ffd27a",
  Chorus: "#ff7a1a",
  Rap: "#14d9a0",
  Drop: "#ff4d2e",
  Bridge: "#ffa37a",
  Outro: "#c2a9b8",
};
const SINGER_LABEL: Record<Singer, string> = { male: "♂ Male", female: "♀ Female", both: "♀♂ Both" };
const NEXT_SINGER: Record<string, Singer | null> = { none: "male", male: "female", female: "both", both: null };

// Song Studio's Create: Simple (one sentence), Custom (every control) or Instrumental.
export function CreateForm({ credits, available, onCreated }: { credits: number; available: boolean; onCreated: () => void }) {
  const [mode, setMode] = useState<Mode>("simple");
  const [topic, setTopic] = useState("");
  const [genre, setGenre] = useState<string>("desi-hip-hop");
  const [mood, setMood] = useState("happy");
  const [language, setLanguage] = useState("hinglish");
  const [durationSec, setDurationSec] = useState(60);
  const [kidSafe, setKidSafe] = useState(false);
  const [title, setTitle] = useState("");
  // The lyrics are the source of truth for the structure blocks: blocks are read from its [tags].
  const [lyrics, setLyrics] = useState("[Verse]\n\n[Chorus]\n\n[Verse]\n\n[Chorus]");
  const [style, setStyle] = useState("");
  const [vocal, setVocal] = useState("auto");
  const [twoTakes, setTwoTakes] = useState(true);
  const [model, setModel] = useState<"ace-step" | "lyria">("ace-step");
  const [experiment, setExperiment] = useState(EXPERIMENT_DEFAULT);
  const [strictness, setStrictness] = useState(STYLE_STRICTNESS_DEFAULT);
  const [bpm, setBpm] = useState<number | null>(null);
  const [keyScale, setKeyScale] = useState("");
  const [picked, setPicked] = useState<number | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  const [busy, setBusy] = useState<"lyrics" | "enhance" | "rap" | "style" | "make" | null>(null);
  const [error, setError] = useState<{ text: string; credits: boolean } | null>(null);
  const [made, setMade] = useState<string | null>(null);

  const short = model === "lyria";
  const length = short ? 30 : durationSec;
  const options = { topic, genre, mood, language, durationSec: length, kidSafe };
  const blocks = blocksOf(lyrics);
  const duet = vocal === "duet";
  const noWords = onlyTags(lyrics);

  function fail(text: string, needCredits = false) {
    setError({ text, credits: needCredits });
  }

  // With words already in the box, AI grows them into a full song and keeps them; with only blocks, it writes in that shape.
  async function writeLyrics(enhance: boolean) {
    setBusy(enhance ? "enhance" : "lyrics");
    setError(null);
    const structure = blocks.length ? structureOf(lyrics) : undefined;
    const { ok, data } = await postJson<{ title: string; lyrics: string }>("/api/songs/lyrics", enhance ? { ...options, draft: lyrics, structure, duet } : { ...options, structure, duet });
    setBusy(null);
    if (!ok) return fail(data.error ?? "Couldn't write lyrics");
    if (!title || !enhance) setTitle(data.title);
    setLyrics(data.lyrics);
    setPicked(null);
  }

  async function writeRap() {
    setBusy("rap");
    setError(null);
    const { ok, data } = await postJson<{ bars: string }>("/api/songs/lyrics/rap", { ...options, lyrics, bars: 8 });
    setBusy(null);
    if (!ok) return fail(data.error ?? "Couldn't write a rap verse");
    setLyrics((l) => insertRap(l, data.bars));
  }

  async function enhanceStyle() {
    setBusy("style");
    setError(null);
    const { ok, data } = await postJson<{ style: string }>("/api/songs/style", { ...options, idea: style || topic, vocal });
    setBusy(null);
    if (!ok) return fail(data.error ?? "Couldn't write a style");
    setStyle(data.style);
  }

  function addChip(chip: string) {
    setStyle((s) => (s.toLowerCase().includes(chip) ? s : s.trim() ? `${s.trim().replace(/,$/, "")}, ${chip}` : chip));
  }

  function moveBlock(from: number, to: number) {
    let next = lyrics;
    for (let i = from; i !== to; i += to > from ? 1 : -1) next = moveSection(next, i, to > from ? 1 : -1);
    setLyrics(next);
    setPicked(to);
  }

  function onDrop(e: DragEvent, to: number) {
    e.preventDefault();
    if (dragFrom !== null && dragFrom !== to) moveBlock(dragFrom, to);
    setDragFrom(null);
    setDragOver(null);
  }

  async function make(e: FormEvent) {
    e.preventDefault();
    setBusy("make");
    setError(null);
    setMade(null);
    const body = {
      ...options,
      mode,
      title,
      // Simple mode sends only the shape; AI writes the words.
      lyrics: mode === "custom" ? lyrics : "",
      structure: mode === "simple" && blocks.length ? structureOf(lyrics) : undefined,
      style: mode === "simple" ? undefined : style,
      vocal: mode === "instrumental" ? "auto" : vocal,
      takes: twoTakes ? 2 : 1,
      model,
      experiment,
      strictness,
      bpm: bpm ?? undefined,
      keyScale: keyScale || undefined,
    };
    const { ok, data } = await postJson<{ id: string; title: string }>("/api/songs", body);
    setBusy(null);
    if (!ok) return fail(data.error ?? "Something went wrong", Boolean(data.needCredits));
    setMade(data.title);
    onCreated();
  }

  const canMake = available && (mode === "custom" ? title.trim() && lyrics.trim().length >= 20 && !noWords : topic.trim().length >= 3 || title.trim());

  return (
    <form onSubmit={make} className={css.form}>
      <div className={css.modes} role="group" aria-label="How to make it">
        {(
          [
            ["simple", "Simple", "One sentence"],
            ["custom", "Custom", "Every control"],
            ["instrumental", "Instrumental", "No vocals"],
          ] as const
        ).map(([m, label, help]) => (
          <button type="button" key={m} aria-pressed={mode === m} onClick={() => setMode(m)}>
            {label}
            <small>{help}</small>
          </button>
        ))}
      </div>

      <label htmlFor="topic">{mode === "simple" ? "Describe your song in one sentence" : mode === "instrumental" ? "What should it feel like?" : "What is the song about?"}</label>
      <textarea
        id="topic"
        className={mode === "simple" ? css.oneLine : undefined}
        value={topic}
        maxLength={300}
        onChange={(e) => setTopic(e.target.value)}
        style={mode === "simple" ? undefined : { minHeight: 64 }}
        placeholder={
          mode === "instrumental"
            ? "e.g. a late-night drive through Dubai, warm and slow"
            : "e.g. a Hinglish hip-hop song about chasing dreams with chai and friends"
        }
      />
      {mode === "simple" && <p className={`muted ${css.help}`}>AI writes the title, lyrics and sound. You get {twoTakes ? "two versions" : "one version"} to choose from.</p>}

      <label>Style</label>
      <div className="ideas" style={{ marginTop: 0 }}>
        {STYLE_PRESETS.map((g) => (
          <button type="button" key={g.id} aria-pressed={genre === g.id} className="chip" onClick={() => setGenre(g.id)}>
            {g.label}
          </button>
        ))}
      </div>

      <div className="row">
        <div>
          <label htmlFor="lang">Language</label>
          <select id="lang" value={language} onChange={(e) => setLanguage(e.target.value)} disabled={mode === "instrumental"}>
            {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.native}</option>)}
            <option value="hinglish">Hinglish</option>
            <option value="pa">ਪੰਜਾਬੀ</option>
          </select>
        </div>
        <div>
          <label htmlFor="mood">Mood</label>
          <select id="mood" value={mood} onChange={(e) => setMood(e.target.value)}>
            {MOODS.map((m) => <option key={m} value={m}>{m[0].toUpperCase() + m.slice(1)}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="len">Length</label>
          <select id="len" value={short ? "short" : length} onChange={(e) => (e.target.value === "short" ? setModel("lyria") : (setModel("ace-step"), setDurationSec(Number(e.target.value))))}>
            <option value="short">30 s short · Lyria</option>
            <option value={30}>30 s</option>
            <option value={60}>1 min</option>
            <option value={120}>2 min</option>
          </select>
        </div>
      </div>
      {short && <p className="muted">A 30-second song for a reel or a hook, made with Google Lyria. Keep the lyrics short: about 6–8 lines.</p>}

      {mode !== "instrumental" && (
        <>
          <label>Voice</label>
          <div className="ideas" style={{ marginTop: 0 }}>
            {(
              [
                ["auto", "Any"],
                ["female", "♀ Female"],
                ["male", "♂ Male"],
                ["duet", "♀♂ Duet"],
              ] as const
            ).map(([v, label]) => (
              <button type="button" key={v} className="chip" aria-pressed={vocal === v} onClick={() => setVocal(v)}>
                {label}
              </button>
            ))}
          </div>
          {duet && <p className={`muted ${css.help}`}>Tap a block, then pick who sings it. AI alternates verses between the male and female voice.</p>}

          <div className={css.blocksHead}>
            <label id="blocks-label">Song structure</label>
            <span className="muted">Tap to add · drag or use the arrows to reorder</span>
          </div>
          <div className={css.blocks} role="list" aria-labelledby="blocks-label">
            {blocks.map((b, i) => (
              <button
                type="button"
                role="listitem"
                key={`${i}-${b.kind}`}
                draggable
                aria-pressed={picked === i}
                aria-label={`${b.kind}${b.singer ? `, ${b.singer}` : ""}${b.empty ? ", no words yet" : ""}`}
                className={[css.block, css[`k-${b.kind}`], b.empty && mode === "custom" ? css.empty : "", dragOver === i ? css.dragOver : ""].filter(Boolean).join(" ")}
                onClick={() => setPicked(picked === i ? null : i)}
                onDragStart={() => setDragFrom(i)}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(i);
                }}
                onDragLeave={() => setDragOver(null)}
                onDrop={(e) => onDrop(e, i)}
              >
                {b.kind}
                {b.singer && <span className={css.who}>{b.singer === "both" ? "♀♂" : b.singer === "male" ? "♂" : "♀"}</span>}
              </button>
            ))}
          </div>
          {picked !== null && blocks[picked] && (
            <div className={css.tools}>
              <button type="button" className="secondary" disabled={picked === 0} onClick={() => moveBlock(picked, picked - 1)} aria-label="Move earlier">← Earlier</button>
              <button type="button" className="secondary" disabled={picked === blocks.length - 1} onClick={() => moveBlock(picked, picked + 1)} aria-label="Move later">Later →</button>
              {duet && (
                <button type="button" className="secondary" onClick={() => setLyrics(setSinger(lyrics, picked, NEXT_SINGER[blocks[picked].singer ?? "none"]))}>
                  {blocks[picked].singer ? SINGER_LABEL[blocks[picked].singer!] : "Who sings: either"}
                </button>
              )}
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setLyrics(removeSection(lyrics, picked));
                  setPicked(null);
                }}
              >
                Remove {blocks[picked].kind}
              </button>
            </div>
          )}
          <div className={css.palette}>
            {SECTION_KINDS.map((k) => (
              <button type="button" key={k} style={{ ["--dot" as string]: BLOCK_DOT[k] }} onClick={() => setLyrics(addSection(lyrics, k))}>
                + {k}
              </button>
            ))}
          </div>
        </>
      )}

      {mode === "custom" && (
        <>
          <div className={css.aiRow}>
            <button type="button" onClick={() => writeLyrics(false)} disabled={busy !== null || topic.trim().length < 3}>
              {busy === "lyrics" ? "Writing…" : noWords ? "✨ Write lyrics with AI" : "✨ Rewrite lyrics with AI"}
            </button>
            <button type="button" className={`secondary ${css.rap}`} onClick={writeRap} disabled={busy !== null || (topic.trim().length < 3 && noWords)}>
              {busy === "rap" ? "Writing bars…" : "✨ Write a rap verse"}
            </button>
          </div>

          <label htmlFor="title">Title</label>
          <input id="title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="Chai Ke Saath" />
          <label htmlFor="lyrics">Lyrics</label>
          <textarea id="lyrics" className={css.lyrics} value={lyrics} onChange={(e) => setLyrics(e.target.value)} maxLength={3000} placeholder={"[Verse]\n...\n\n[Chorus]\n..."} />
          <div className={css.aiRow}>
            <button type="button" className="secondary" onClick={() => writeLyrics(true)} disabled={busy !== null || noWords || lyrics.trim().length < 10}>
              {busy === "enhance" ? "Writing…" : "✨ Enhance my lyrics"}
            </button>
            <span className="muted" style={{ alignSelf: "center" }}>Write a few lines of your own; AI makes them a full song and keeps your lines.</span>
          </div>
        </>
      )}

      {mode !== "simple" && (
        <>
          <label htmlFor="style">Sound (optional)</label>
          <textarea
            id="style"
            value={style}
            onChange={(e) => setStyle(e.target.value)}
            maxLength={500}
            placeholder="e.g. dark trap beat, tabla and 808s. Leave empty to use the style above."
            style={{ minHeight: 70 }}
          />
          <div className="ideas">
            {STYLE_CHIPS.map((chip) => {
              const on = style.toLowerCase().includes(chip);
              return <button type="button" key={chip} className="chip" aria-pressed={on} onClick={() => addChip(chip)}>{on ? chip : `+ ${chip}`}</button>;
            })}
          </div>
          <div className={css.aiRow}>
            <button type="button" className="secondary" onClick={enhanceStyle} disabled={busy !== null}>
              {busy === "style" ? "Writing…" : "✨ Enhance style"}
            </button>
            <span className="muted" style={{ alignSelf: "center" }}>Turns a few words into a detailed sound: instruments, tempo, vocals.</span>
          </div>

          <div className={css.dials}>
            {!short && (
              <>
                <Dial id="experiment" label="Experiment" left="Safe" right="Wild" value={experiment} onChange={setExperiment} />
                <Dial id="strictness" label="Follow my style" left="Loose" right="Strict" value={strictness} onChange={setStrictness} />
                {slowStyle(strictness) && <p className="muted" style={{ margin: 0 }}>A stricter style takes a few minutes longer to make.</p>}
              </>
            )}
            <div className={css.musicRow}>
              <div>
                <label htmlFor="bpm" style={{ marginTop: 0 }}>Tempo</label>
                <div className={css.bpm}>
                  <select id="bpm-auto" aria-label="Tempo" value={bpm === null ? "auto" : "set"} onChange={(e) => setBpm(e.target.value === "auto" ? null : 96)}>
                    <option value="auto">Auto</option>
                    <option value="set">Set BPM</option>
                  </select>
                  {bpm !== null && (
                    <input
                      id="bpm"
                      type="number"
                      min={BPM_MIN}
                      max={BPM_MAX}
                      value={bpm}
                      onChange={(e) => setBpm(Number(e.target.value))}
                      onBlur={() => setBpm(Math.min(BPM_MAX, Math.max(BPM_MIN, Math.round(bpm || 96))))}
                    />
                  )}
                </div>
              </div>
              <div>
                <label htmlFor="key" style={{ marginTop: 0 }}>Key</label>
                <select id="key" value={keyScale} onChange={(e) => setKeyScale(e.target.value)}>
                  <option value="">Auto</option>
                  {KEY_SCALES.map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
              </div>
            </div>
          </div>

          {mode === "instrumental" && (
            <>
              <label htmlFor="ititle">Title (optional)</label>
              <input id="ititle" type="text" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="Taken from your idea when empty" />
            </>
          )}
        </>
      )}

      {mode !== "instrumental" && (
        <label className="check">
          <input type="checkbox" checked={kidSafe} onChange={(e) => setKidSafe(e.target.checked)} /> For kids
        </label>
      )}
      <label className="check">
        <input type="checkbox" checked={twoTakes} onChange={(e) => setTwoTakes(e.target.checked)} /> Make 2 versions to choose from (same price)
      </label>

      <button type="submit" className={css.make} disabled={busy !== null || !canMake}>
        {busy === "make" ? (mode === "simple" ? "Writing your song…" : "Starting…") : `${twoTakes ? "Make 2 versions" : "Make song"} · ${credits} credits`}
      </button>
      <p className="muted">Songs can&apos;t name or imitate real singers or bands. Every song gets AI cover art and is marked as made with AI.</p>

      {made && (
        <div className="banner" role="status">
          🎶 &ldquo;{made}&rdquo; is being made. It appears in My songs in about a minute; you can leave this page.
        </div>
      )}
      {error && (
        <div className="status error-box" role="alert">
          {error.text} {error.credits && <a href="/billing">Get credits</a>}
        </div>
      )}
    </form>
  );
}

function Dial({ id, label, left, right, value, onChange }: { id: string; label: string; left: string; right: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className={css.dial}>
      <div className={css.dialHead}>
        <label htmlFor={id}>{label}</label>
      </div>
      <input
        id={id}
        type="range"
        min={0}
        max={100}
        step={5}
        value={value}
        className={css.range}
        style={{ ["--fill" as string]: `${value}%` }}
        aria-valuetext={`${value <= 33 ? left : value >= 67 ? right : "Middle"} (${value} of 100)`}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <div className={css.dialEnds} aria-hidden="true">
        <span>{left}</span>
        <span>{right}</span>
      </div>
    </div>
  );
}
