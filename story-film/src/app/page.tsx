"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Icon, type IconName } from "./app-shell";
import { ReelLogo } from "./reel-logo";

type Film = { id: string; status: string; stage: string | null; title: string | null; createdAt: string; videoUrl: string | null; format?: string };
type Post = { id: string; filmId: string; title: string; scheduledAt: string; status: string; platform: string | null; accountName: string | null };
type Billing = { balance: number; freeLeft?: number; freeVideosPerWeek?: number };

const TILES: { href: string; label: string; icon: IconName; kind?: "main" | "ai" }[] = [
  { href: "/create", label: "Make reel", icon: "create", kind: "main" },
  { href: "/create?mode=cartoon", label: "Cartoon", icon: "cartoon" },
  { href: "/create?mode=film", label: "Short film", icon: "film" },
  { href: "/create?mode=edit", label: "Edit video", icon: "edit" },
  { href: "/ask?q=Give%20me%203%20reel%20ideas%20for%20this%20week", label: "Ideas", icon: "spark", kind: "ai" },
  { href: "/songs", label: "Song", icon: "songs" },
  { href: "/brand", label: "Brand kit", icon: "brand" },
  { href: "/insights", label: "Insights", icon: "insights" },
];

const PLATFORMS: Record<string, { short: string; color: string; name: string }> = {
  instagram: { short: "IG", color: "#e1306c", name: "Instagram Reels" },
  youtube: { short: "YT", color: "#ff0033", name: "YouTube Shorts" },
};

const STATUS: Record<string, string> = { queued: "Queued", running: "Making", review: "Check effects", completed: "Ready", failed: "Failed" };
const THUMBS = ["linear-gradient(170deg,#ff4d2e,#2a1235)", "linear-gradient(170deg,#14d9a0,#0a4d3a)", "linear-gradient(170deg,#ffb21a,#d9381c)", "linear-gradient(170deg,#ff7a1a,#47243d)"];

// Monday 00:00 in the creator's time zone, matching the free-reel week.
function weekStart(now = new Date()) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

const when = (iso: string) =>
  new Intl.DateTimeFormat(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

export default function Home() {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const [films, setFilms] = useState<Film[] | null>(null);
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [billing, setBilling] = useState<Billing | null>(null);
  const [ask, setAsk] = useState("");

  useEffect(() => {
    const from = weekStart();
    const to = new Date(Date.now() + 14 * 86_400_000);
    fetch("/api/films").then(async (r) => setFilms(r.ok ? (await r.json()).films : [])).catch(() => setFilms([]));
    fetch(`/api/posts?from=${from.toISOString()}&to=${to.toISOString()}`)
      .then(async (r) => setPosts(r.ok ? (await r.json()).posts : []))
      .catch(() => setPosts([]));
    fetch("/api/billing").then(async (r) => r.ok && setBilling(await r.json())).catch(() => {});
  }, []);

  const week = useMemo(() => {
    const start = weekStart().getTime();
    const now = Date.now();
    const made = (films ?? []).filter((f) => new Date(f.createdAt).getTime() >= start);
    const live = (posts ?? []).filter((p) => p.status !== "cancelled");
    return {
      made: made.length,
      ready: made.filter((f) => f.status === "completed").length,
      posted: live.filter((p) => p.status === "published" && new Date(p.scheduledAt).getTime() >= start).length,
      upcoming: live.filter((p) => (p.status === "scheduled" || p.status === "publishing") && new Date(p.scheduledAt).getTime() >= now).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)),
    };
  }, [films, posts]);

  const making = films?.find((f) => f.status === "queued" || f.status === "running" || f.status === "review");
  const latest = films?.find((f) => f.status === "completed");
  const name = session?.user.name?.split(" ")[0];
  const perWeek = billing?.freeVideosPerWeek ?? 0;
  const freeLeft = billing?.freeLeft;
  const next = week.upcoming[0];

  function submitAsk(e: FormEvent) {
    e.preventDefault();
    router.push(ask.trim() ? `/ask?q=${encodeURIComponent(ask.trim())}` : "/ask");
  }

  return (
    <main className="home">
      <section className="hero home-hero" aria-labelledby="home-title">
        <div className="home-hero-main">
          <h1 id="home-title">{name ? `Hi, ${name}` : "Your studio"}</h1>
          <p className="over">Reels made this week</p>
          <p className="home-big">
            {films === null ? "–" : week.made} <small>{week.made === 1 ? "reel" : "reels"}</small>
          </p>
          <p className="home-fine">
            {week.ready} ready · {week.posted} posted · {week.upcoming.length} scheduled
          </p>
          <div className="home-chips">
            {freeLeft !== undefined && perWeek > 0 && <span className="hchip mint">{freeLeft} of {perWeek} free left</span>}
            {billing && <span className="hchip">{billing.balance} credits</span>}
            {next && <span className="hchip">Next post {when(next.scheduledAt)}</span>}
          </div>
        </div>
        <div className="home-hero-side">
          {freeLeft !== undefined && perWeek > 0 && (
            <div className="home-meter">
              <span className="meter" role="img" aria-label={`${freeLeft} of ${perWeek} free reels left this week`}>
                <i style={{ width: `${(freeLeft / perWeek) * 100}%` }} />
              </span>
              <span>Free reels reset every Monday</span>
            </div>
          )}
          <form className="ask-box" onSubmit={submitAsk} role="search" aria-label="Ask Reelkar">
            <Icon name="spark" size={18} />
            <label htmlFor="home-ask" className="sr-only">Ask Reelkar</label>
            <input id="home-ask" value={ask} onChange={(e) => setAsk(e.target.value)} placeholder="Ask Reelkar: a reel about chai?" autoComplete="off" />
            <button type="submit" aria-label="Ask"><Icon name="arrow" size={18} /></button>
          </form>
        </div>
      </section>

      <nav className="tiles" aria-label="Quick actions">
        {TILES.map((t) => (
          <Link key={t.label} href={t.href} className={`tile${t.kind ? ` ${t.kind}` : ""}`}>
            <i><Icon name={t.icon} /></i>
            {t.label}
          </Link>
        ))}
      </nav>

      <div className="home-grid">
        <section className="card home-card" aria-labelledby="reels-title">
          <div className="card-head">
            <h2 id="reels-title">My reels</h2>
            {films && films.length > 0 && <Link href="/create">Make another</Link>}
          </div>
          {films === null ? (
            <div className="reel-grid" aria-hidden="true">{[0, 1, 2, 3].map((i) => <span key={i} className="reel-thumb skeleton" />)}</div>
          ) : films.length === 0 ? (
            <div className="empty">
              <ReelLogo size={48} />
              <p>Your reels will show up here once you make one.</p>
              <Link href="/create" className="btn">Make my first reel</Link>
            </div>
          ) : (
            <div className="reel-grid">
              {films.slice(0, 8).map((f, i) => {
                const body = (
                  <>
                    {f.videoUrl && <video src={`${f.videoUrl}#t=0.5`} preload="metadata" muted playsInline aria-hidden="true" tabIndex={-1} />}
                    <span className={`rpill rpill-${f.status}`}>{STATUS[f.status] ?? f.status}</span>
                    <span className="reel-title">{f.title ?? "Untitled"}</span>
                  </>
                );
                return f.videoUrl ? (
                  <a key={f.id} className="reel-thumb" href={f.videoUrl} target="_blank" rel="noreferrer" style={{ background: THUMBS[i % THUMBS.length] }}>{body}</a>
                ) : (
                  <Link key={f.id} className="reel-thumb" href={`/create?film=${f.id}`} style={{ background: THUMBS[i % THUMBS.length] }}>{body}</Link>
                );
              })}
            </div>
          )}
        </section>

        <div className="home-side">
          {making ? (
            <Link href={`/create?film=${making.id}`} className="alert-card">
              <span className="alert-th"><ReelLogo size={30} loop /></span>
              <span className="grow">
                <b>{making.status === "review" ? "Check your effects" : "Making your reel"}</b>
                {making.title ?? "New reel"} · {STATUS[making.status]}
              </span>
              <span className="alert-go">Open</span>
            </Link>
          ) : latest ? (
            <Link href={`/calendar?film=${latest.id}`} className="alert-card">
              <span className="alert-th"><Icon name="play" size={20} /></span>
              <span className="grow">
                <b>Your reel is ready</b>
                {latest.title ?? "Untitled"}
              </span>
              <span className="alert-go">Schedule</span>
            </Link>
          ) : null}

          <section className="card home-card" aria-labelledby="next-title">
            <div className="card-head">
              <h2 id="next-title">Coming up</h2>
              <Link href="/calendar">Calendar</Link>
            </div>
            {posts === null ? (
              <p className="muted">Loading…</p>
            ) : week.upcoming.length === 0 ? (
              <p className="muted">Nothing scheduled yet. <Link href="/calendar">Plan this week&apos;s posts</Link>.</p>
            ) : (
              <ul className="upnext">
                {week.upcoming.slice(0, 5).map((p) => {
                  const pl = PLATFORMS[p.platform ?? ""] ?? { short: "•", color: "var(--ink-muted)", name: p.platform ?? "Post" };
                  return (
                    <li key={p.id}>
                      <span className="pdot" style={{ background: pl.color }} aria-hidden="true">{pl.short}</span>
                      <span className="grow">
                        {p.title}
                        <small>{p.accountName ?? pl.name}</small>
                      </span>
                      <time dateTime={p.scheduledAt}>{when(p.scheduledAt)}</time>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
