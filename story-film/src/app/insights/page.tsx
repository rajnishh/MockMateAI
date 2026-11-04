"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Film = { id: string; status: string; format?: string; createdAt: string; title: string | null };
type Post = { id: string; status: string; platform: string | null; scheduledAt: string; publishedAt: string | null };

const WEEKS = 8;
const DAY = 86_400_000;
const FORMATS: Record<string, string> = { story: "Cartoons and films", motion: "Motion reels", dance: "Dance reels", edit: "Video edits" };
const PLATFORMS: Record<string, string> = { instagram: "Instagram", youtube: "YouTube" };

function weekStart(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

const short = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });

// Studio activity from Reelkar's own records. Views and likes need each platform's analytics access,
// which Reelkar doesn't ask for yet, so this page doesn't show them.
export default function InsightsPage() {
  const [films, setFilms] = useState<Film[] | null>(null);
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const from = new Date(weekStart().getTime() - (WEEKS - 1) * 7 * DAY);
    const to = new Date(Date.now() + 60 * DAY);
    Promise.all([
      fetch("/api/films").then((r) => (r.ok ? r.json() : Promise.reject(new Error()))),
      fetch(`/api/posts?from=${from.toISOString()}&to=${to.toISOString()}`).then((r) => (r.ok ? r.json() : Promise.reject(new Error()))),
    ])
      .then(([f, p]) => {
        setFilms(f.films);
        setPosts(p.posts);
      })
      .catch(() => setError("Couldn't load your insights. Refresh to try again."));
  }, []);

  const stats = useMemo(() => {
    if (!films || !posts) return null;
    const start = weekStart().getTime();
    const weeks = Array.from({ length: WEEKS }, (_, i) => {
      const from = start - (WEEKS - 1 - i) * 7 * DAY;
      const inWeek = (iso: string) => {
        const t = new Date(iso).getTime();
        return t >= from && t < from + 7 * DAY;
      };
      return {
        label: short.format(new Date(from)),
        made: films.filter((f) => inWeek(f.createdAt)).length,
        posted: posts.filter((p) => p.status === "published" && inWeek(p.publishedAt ?? p.scheduledAt)).length,
      };
    });
    const recent = films.filter((f) => new Date(f.createdAt).getTime() >= start - (WEEKS - 1) * 7 * DAY);
    const finished = recent.filter((f) => f.status === "completed").length;
    const failed = recent.filter((f) => f.status === "failed").length;
    const count = <T,>(items: T[], key: (t: T) => string) =>
      Object.entries(items.reduce<Record<string, number>>((m, t) => ((m[key(t)] = (m[key(t)] ?? 0) + 1), m), {})).sort((a, b) => b[1] - a[1]);
    const published = posts.filter((p) => p.status === "published");
    let streak = 0;
    for (let i = WEEKS - 1; i >= 0 && weeks[i].made > 0; i--) streak++;
    return {
      weeks,
      made: recent.length,
      finished,
      successRate: finished + failed ? Math.round((finished / (finished + failed)) * 100) : null,
      posted: published.length,
      scheduled: posts.filter((p) => p.status === "scheduled" && new Date(p.scheduledAt).getTime() > Date.now()).length,
      failedPosts: posts.filter((p) => p.status === "failed").length,
      formats: count(recent, (f) => f.format ?? "story"),
      platforms: count(published, (p) => p.platform ?? "other"),
      streak,
      peak: Math.max(1, ...weeks.map((w) => Math.max(w.made, w.posted))),
    };
  }, [films, posts]);

  return (
    <main>
      <header className="top">
        <div>
          <h1>Insights</h1>
          <p className="sub">How your studio is doing over the last {WEEKS} weeks.</p>
        </div>
      </header>

      {error && <div className="status error-box" role="alert">{error}</div>}

      {!stats && !error ? (
        <div className="insight-grid" aria-busy="true">{[0, 1, 2, 3].map((i) => <div key={i} className="card stat skeleton" />)}</div>
      ) : stats ? (
        <>
          <div className="insight-grid">
            <div className="hero stat-hero">
              <span className="over">Reels made</span>
              <strong>{stats.made}</strong>
              <span className="muted">{stats.streak > 1 ? `${stats.streak}-week streak` : stats.streak === 1 ? "Made one this week" : "None this week yet"}</span>
            </div>
            <div className="card stat">
              <span className="over">Finished</span>
              <strong>{stats.successRate === null ? "–" : `${stats.successRate}%`}</strong>
              <span className="muted">{stats.finished} ready to post</span>
            </div>
            <div className="card stat">
              <span className="over">Posted</span>
              <strong>{stats.posted}</strong>
              <span className="muted">{stats.failedPosts ? `${stats.failedPosts} didn't post` : "From Reelkar"}</span>
            </div>
            <div className="card stat">
              <span className="over">Scheduled</span>
              <strong>{stats.scheduled}</strong>
              <span className="muted"><Link href="/calendar">See calendar</Link></span>
            </div>
          </div>

          <section className="card home-card" aria-labelledby="weeks-title" style={{ marginTop: 20 }}>
            <div className="card-head">
              <h2 id="weeks-title">Week by week</h2>
              <span className="legend"><i className="lg-made" /> Made <i className="lg-posted" /> Posted</span>
            </div>
            <div className="bars" role="list" aria-label="Reels made and posted each week">
              {stats.weeks.map((w) => (
                <div key={w.label} className="bar-col" role="listitem">
                  <div className="bar-pair" aria-hidden="true">
                    <span className="bar made" style={{ height: `${(w.made / stats.peak) * 100}%` }} />
                    <span className="bar posted" style={{ height: `${(w.posted / stats.peak) * 100}%` }} />
                  </div>
                  <span className="bar-label">{w.label}</span>
                  <span className="sr-only">: {w.made} made, {w.posted} posted</span>
                </div>
              ))}
            </div>
          </section>

          <div className="home-grid" style={{ marginTop: 20 }}>
            <section className="card home-card" aria-labelledby="types-title">
              <div className="card-head"><h2 id="types-title">What you make</h2></div>
              {stats.formats.length === 0 ? (
                <p className="muted">No reels yet. <Link href="/create">Make your first one</Link>.</p>
              ) : (
                <ul className="split-list">
                  {stats.formats.map(([k, n]) => (
                    <li key={k}>
                      <span>{FORMATS[k] ?? k}</span>
                      <span className="meter"><i style={{ width: `${(n / stats.made) * 100}%` }} /></span>
                      <b>{n}</b>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="card home-card" aria-labelledby="where-title">
              <div className="card-head"><h2 id="where-title">Where you post</h2></div>
              {stats.platforms.length === 0 ? (
                <p className="muted">Nothing posted from Reelkar yet. <Link href="/calendar">Connect an account and schedule a post</Link>.</p>
              ) : (
                <ul className="split-list">
                  {stats.platforms.map(([k, n]) => (
                    <li key={k}>
                      <span>{PLATFORMS[k] ?? k}</span>
                      <span className="meter"><i style={{ width: `${(n / stats.posted) * 100}%` }} /></span>
                      <b>{n}</b>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
          <p className="muted" style={{ marginTop: 16 }}>Views, likes and followers from Instagram and YouTube aren&apos;t shown yet. These numbers come from what you make and post with Reelkar.</p>
        </>
      ) : null}
    </main>
  );
}
