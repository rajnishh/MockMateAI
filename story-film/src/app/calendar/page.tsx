"use client";

import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Account = { id: string; platform: string; name: string; imageUrl: string | null };
type Film = { id: string; status: string; title: string | null; kidSafe: boolean };
type Post = {
  id: string;
  title: string;
  scheduledAt: string;
  status: string;
  privacy: string;
  externalUrl: string | null;
  error: string | null;
  accountName: string | null;
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function dayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// Value for <input type="datetime-local"> in the viewer's own timezone.
function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function monthGrid(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first);
  start.setDate(1 - ((first.getDay() + 6) % 7)); // weeks start on Monday
  return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
}

export default function CalendarPage() {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selected, setSelected] = useState(() => new Date());
  const [posts, setPosts] = useState<Post[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [youtubeAvailable, setYoutubeAvailable] = useState(false);
  const [films, setFilms] = useState<Film[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [filmId, setFilmId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [privacy, setPrivacy] = useState("public");
  const [madeForKids, setMadeForKids] = useState(false);
  const [when, setWhen] = useState(() => toLocalInput(new Date(Date.now() + 60 * 60 * 1000)));
  const [saving, setSaving] = useState(false);

  const grid = useMemo(() => monthGrid(month), [month]);

  const loadPosts = useCallback(async () => {
    const res = await fetch(`/api/posts?from=${grid[0].toISOString()}&to=${grid[41].toISOString()}`);
    if (res.ok) setPosts((await res.json()).posts);
  }, [grid]);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  useEffect(() => {
    fetch("/api/accounts").then(async (r) => {
      if (!r.ok) return;
      const d = await r.json();
      setAccounts(d.accounts);
      setYoutubeAvailable(d.youtubeAvailable);
      if (d.accounts[0]) setAccountId(d.accounts[0].id);
    });
    fetch("/api/films").then(async (r) => {
      if (!r.ok) return;
      const done: Film[] = (await r.json()).films.filter((f: Film) => f.status === "completed");
      setFilms(done);
      const wanted = new URLSearchParams(window.location.search).get("film");
      const pick = done.find((f) => f.id === wanted) ?? done[0];
      if (pick) choose(pick);
    });
    const q = new URLSearchParams(window.location.search);
    if (q.get("connected")) setNotice("YouTube channel connected.");
    if (q.get("error")) setError(q.get("error") === "denied" ? "YouTube access was not granted." : `Couldn't connect: ${q.get("error")}`);
  }, []);

  function choose(f: Film) {
    setFilmId(f.id);
    setTitle(f.title ?? "");
    setMadeForKids(f.kidSafe);
    setDescription(`${f.title ?? ""}\n\nMade with AI.\n#Shorts`);
  }

  async function schedule(e: FormEvent, now = false) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch("/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filmId,
        socialAccountId: accountId,
        title,
        description,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        privacy,
        madeForKids,
        ...(now ? {} : { scheduledAt: new Date(when).toISOString() }),
      }),
    });
    setSaving(false);
    const body = await res.json();
    if (!res.ok) return setError(body.error);
    setNotice(now ? "Uploading to YouTube now." : "Scheduled.");
    setSelected(new Date(body.post.scheduledAt));
    loadPosts();
  }

  async function act(post: Post, action: "cancel" | "retry") {
    const res = await fetch(action === "cancel" ? `/api/posts/${post.id}` : `/api/posts/${post.id}/retry`, {
      method: action === "cancel" ? "DELETE" : "POST",
    });
    if (!res.ok) setError((await res.json()).error);
    loadPosts();
  }

  async function disconnect(a: Account) {
    if (!confirm(`Disconnect ${a.name}? Its scheduled posts will be removed.`)) return;
    await fetch(`/api/accounts/${a.id}`, { method: "DELETE" });
    setAccounts((xs) => xs.filter((x) => x.id !== a.id));
    loadPosts();
  }

  const byDay = useMemo(() => {
    const m = new Map<string, Post[]>();
    for (const p of posts) {
      const k = dayKey(new Date(p.scheduledAt));
      m.set(k, [...(m.get(k) ?? []), p]);
    }
    return m;
  }, [posts]);
  const dayPosts = byDay.get(dayKey(selected)) ?? [];
  const today = dayKey(new Date());

  return (
    <main>
      <header className="top">
        <h1>Calendar</h1>
        <Link href="/">← Create</Link>
      </header>
      {notice && <div className="status">{notice}</div>}
      {error && <div className="status">{error}</div>}

      <section>
        <h2>Channels</h2>
        <div className="library">
          {accounts.map((a) => (
            <div key={a.id} className="account">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {a.imageUrl && <img src={a.imageUrl} alt="" />}
              <span>YouTube · {a.name}</span>
              <button type="button" className="secondary" onClick={() => disconnect(a)}>Disconnect</button>
            </div>
          ))}
        </div>
        {youtubeAvailable ? (
          <div className="actions">
            <a href="/api/connect/youtube"><button type="button" className="secondary">+ Connect YouTube</button></a>
          </div>
        ) : (
          <p className="muted">YouTube publishing isn&apos;t set up on this server yet.</p>
        )}
        <p className="muted">Until this app passes Google&apos;s review, YouTube keeps uploads private; you can make them public in YouTube Studio.</p>
      </section>

      <section>
        <div className="month-nav">
          <button type="button" className="secondary" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</button>
          <strong>{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</strong>
          <button type="button" className="secondary" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>›</button>
        </div>
        <div className="month">
          {WEEKDAYS.map((d) => <div key={d} className="weekday">{d}</div>)}
          {grid.map((d) => {
            const k = dayKey(d);
            const count = byDay.get(k)?.length ?? 0;
            return (
              <button
                type="button"
                key={k}
                className="day"
                aria-pressed={k === dayKey(selected)}
                data-other={d.getMonth() !== month.getMonth()}
                data-today={k === today}
                onClick={() => setSelected(d)}
              >
                {d.getDate()}
                {count > 0 && <span className="dot">{count}</span>}
              </button>
            );
          })}
        </div>

        <h2>{selected.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</h2>
        {dayPosts.length === 0 && <p className="muted">Nothing scheduled.</p>}
        <div className="library">
          {dayPosts.map((p) => (
            <div key={p.id} className="post">
              <div>
                <strong>{new Date(p.scheduledAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</strong> {p.title}
                <div className="muted">
                  {p.accountName} · {p.status}
                  {p.externalUrl && <> · <a href={p.externalUrl} target="_blank" rel="noreferrer">View</a></>}
                </div>
                {p.error && <div className="muted">{p.error}</div>}
              </div>
              {(p.status === "scheduled" || p.status === "failed") && (
                <div className="post-actions">
                  {p.status === "failed" && <button type="button" className="secondary" onClick={() => act(p, "retry")}>Retry</button>}
                  <button type="button" className="secondary" onClick={() => act(p, "cancel")}>Cancel</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2>Schedule a video</h2>
        {films.length === 0 ? (
          <p className="muted">Finished videos will appear here. <Link href="/">Make one</Link>.</p>
        ) : accounts.length === 0 ? (
          <p className="muted">Connect a YouTube channel to schedule posts.</p>
        ) : (
          <form onSubmit={(e) => schedule(e)}>
            <label htmlFor="film">Video</label>
            <select id="film" value={filmId} onChange={(e) => choose(films.find((f) => f.id === e.target.value)!)}>
              {films.map((f) => <option key={f.id} value={f.id}>{f.title ?? "Untitled"}</option>)}
            </select>
            <label htmlFor="account">Channel</label>
            <select id="account" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <label htmlFor="title">Title</label>
            <input id="title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} required />
            <label htmlFor="desc">Description</label>
            <textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={5000} style={{ minHeight: 100 }} />
            <label htmlFor="tags">Tags (comma separated)</label>
            <input id="tags" type="text" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="kids, learning, hindi" />
            <div className="row">
              <div>
                <label htmlFor="privacy">Visibility</label>
                <select id="privacy" value={privacy} onChange={(e) => setPrivacy(e.target.value)}>
                  <option value="public">Public</option>
                  <option value="unlisted">Unlisted</option>
                  <option value="private">Private</option>
                </select>
              </div>
              <div>
                <label htmlFor="when">When</label>
                <input id="when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} required />
              </div>
            </div>
            <label className="check">
              <input type="checkbox" checked={madeForKids} onChange={(e) => setMadeForKids(e.target.checked)} /> Made for kids (required by YouTube for children&apos;s content)
            </label>
            <p className="muted">Every upload is marked as AI-generated (&quot;altered or synthetic content&quot;) on YouTube.</p>
            <div className="actions">
              <button type="submit" disabled={saving}>Schedule</button>
              <button type="button" className="secondary" disabled={saving} onClick={(e) => schedule(e, true)}>Publish now</button>
            </div>
          </form>
        )}
      </section>
    </main>
  );
}
