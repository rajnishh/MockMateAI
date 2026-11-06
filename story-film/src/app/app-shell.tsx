"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { ReelLogo } from "./reel-logo";

// The v3.0 web chrome: a deep-plum sidebar from 768px (icons only below 1024px), a floating tab bar
// on phones with Create in the middle, and a top bar with credits and the account menu. Sign-in has no chrome.

const ICONS = {
  home: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />,
  create: <path d="M12 5v14M5 12h14" />,
  cartoon: <><circle cx="12" cy="12" r="9" /><path d="M9 10h.01M15 10h.01M8.5 15a4 4 0 0 0 7 0" /></>,
  film: <><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4" /></>,
  motion: <><path d="M4 17c3-8 6-8 8-4s5 4 8-4" /><circle cx="20" cy="9" r="1.5" /></>,
  dance: <><circle cx="12" cy="4.5" r="2" /><path d="M5 8l4 2h6l4-4M12 10v5l-4 6M12 15l4 2 1 4" /></>,
  edit: <><rect x="3" y="5" width="13" height="14" rx="3" /><path d="M16 10l5-3v10l-5-3" /></>,
  spark: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />,
  songs: <><path d="M9 18V5l11-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="17" cy="16" r="3" /></>,
  ask: <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  credits: <><circle cx="12" cy="12" r="9" /><path d="M9 9.5c0-1.4 1.3-2.5 3-2.5s3 1 3 2.3c0 2.9-6 1.8-6 4.9 0 1.3 1.3 2.3 3 2.3s3-1.1 3-2.5M12 5v2M12 17v2" /></>,
  connect: <><path d="M9 7V3M15 7V3" /><path d="M6 7h12v4a6 6 0 0 1-12 0z" /><path d="M12 17v4" /></>,
  out: <><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M10 17l-5-5 5-5M5 12h11" /></>,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  play: <path d="M9 7l8 5-8 5z" fill="currentColor" />,
  download: <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />,
  share: <><circle cx="18" cy="5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="19" r="2.5" /><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4" /></>,
  link: <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />,
  pip: <><rect x="3" y="5" width="18" height="14" rx="2.5" /><rect x="12" y="11" width="7" height="6" rx="1.2" fill="currentColor" /></>,
  trash: <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />,
  bell: <path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10 20a2 2 0 0 0 4 0" />,
  brand: <><circle cx="12" cy="12" r="9" /><circle cx="8.5" cy="10" r="1.2" /><circle cx="12" cy="7.5" r="1.2" /><circle cx="15.5" cy="10" r="1.2" /><path d="M12 21a3 3 0 0 1 0-6h2" /></>,
  insights: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  listen: <><path d="M4 15v-3a8 8 0 0 1 16 0v3" /><rect x="3" y="14" width="4" height="7" rx="1.5" /><rect x="17" y="14" width="4" height="7" rx="1.5" /></>,
};

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  return (
    <svg className="ic" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}

type Nav = { href: string; label: string; short?: string; icon: IconName; make?: boolean };

const SIDE: Nav[] = [
  { href: "/create", label: "Create", icon: "create", make: true },
  { href: "/", label: "Home", icon: "home" },
  { href: "/songs", label: "Songs", icon: "songs" },
  { href: "/listen", label: "Listen", icon: "listen" },
  { href: "/ask", label: "Ask Reelkar", icon: "ask" },
  { href: "/calendar", label: "Calendar", icon: "calendar" },
  { href: "/billing", label: "Credits", icon: "credits" },
];

const GROW: Nav[] = [
  { href: "/brand", label: "Brand kit", icon: "brand" },
  { href: "/insights", label: "Insights", icon: "insights" },
  { href: "/connect", label: "Connect AI", icon: "connect" },
];

const TABS: Nav[] = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/ask", label: "Ask", icon: "ask" },
  { href: "/create", label: "Create", icon: "create", make: true },
  { href: "/songs", label: "Songs", icon: "songs" },
  { href: "/calendar", label: "Calendar", icon: "calendar" },
];

type Billing = { balance: number; freeLeft?: number; freeVideosPerWeek?: number };

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { data: session } = authClient.useSession();
  const [billing, setBilling] = useState<Billing | null>(null);
  const [menu, setMenu] = useState(false);
  const acct = useRef<HTMLDivElement>(null);
  // Public gift, song and Jugalbandi invite pages open with no sign-in and no app chrome.
  const bare = path === "/login" || path.startsWith("/oauth/") || path.startsWith("/g/") || path.startsWith("/j/") || path.startsWith("/s/") || path.startsWith("/r/");

  useEffect(() => {
    if (bare) return;
    fetch("/api/billing")
      .then(async (r) => r.ok && setBilling(await r.json()))
      .catch(() => {});
  }, [bare, path]);

  useEffect(() => setMenu(false), [path]);

  // Close the account menu on Escape or a click outside it.
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    const onClick = (e: MouseEvent) => !acct.current?.contains(e.target as Node) && setMenu(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [menu]);

  if (bare) return <>{children}</>;

  const current = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  const who = session?.user.name || session?.user.phoneNumber || session?.user.email || "";
  const initial = (session?.user.name?.[0] ?? "R").toUpperCase();
  const perWeek = billing?.freeVideosPerWeek ?? 0;
  const freeLeft = billing?.freeLeft;

  async function signOut() {
    await authClient.signOut();
    window.location.href = "/login";
  }

  return (
    <div className="shell">
      <a className="skip" href="#content">Skip to content</a>
      <nav className="side" aria-label="Main">
        <Link href="/" className="side-brand" aria-label="Reelkar home">
          <ReelLogo size={36} />
          <span>Reelkar</span>
        </Link>
        {SIDE.map((n) => (
          <Link key={n.href} href={n.href} className={n.make ? "nv make" : "nv"} aria-current={current(n.href) ? "page" : undefined} title={n.label}>
            <Icon name={n.icon} />
            <span>{n.label}</span>
          </Link>
        ))}
        <p className="grp">Grow</p>
        {GROW.map((n) => (
          <Link key={n.href} href={n.href} className="nv" aria-current={current(n.href) ? "page" : undefined} title={n.label}>
            <Icon name={n.icon} />
            <span>{n.label}</span>
          </Link>
        ))}
        {freeLeft !== undefined && perWeek > 0 && (
          <Link href="/billing" className="side-free">
            <b>{freeLeft} of {perWeek} free reels left</b>
            <span className="meter" role="img" aria-label={`${freeLeft} of ${perWeek} free reels left this week`}>
              <i style={{ width: `${(freeLeft / perWeek) * 100}%` }} />
            </span>
            Resets every Monday
          </Link>
        )}
      </nav>

      <div className="shell-main">
        <header className="topbar">
          <Link href="/" className="topbar-brand" aria-label="Reelkar home">
            <ReelLogo size={32} />
            <span>Reelkar</span>
          </Link>
          <Link href="/billing" className="credits" aria-label={billing ? `${billing.balance} credits` : "Credits"}>
            <Icon name="credits" size={18} />
            {billing ? `${billing.balance} credits` : "Credits"}
          </Link>
          <div className="acct" ref={acct}>
            <button type="button" className="av" aria-haspopup="menu" aria-expanded={menu} aria-label="Account" onClick={() => setMenu((m) => !m)}>
              {initial}
            </button>
            {menu && (
              <div className="menu" role="menu">
                {who && <p className="menu-who">{who}</p>}
                <Link href="/brand" role="menuitem"><Icon name="brand" size={18} /> Brand kit</Link>
                <Link href="/insights" role="menuitem"><Icon name="insights" size={18} /> Insights</Link>
                <Link href="/billing" role="menuitem"><Icon name="credits" size={18} /> Credits and plans</Link>
                <Link href="/connect" role="menuitem"><Icon name="connect" size={18} /> Connect AI</Link>
                <button type="button" role="menuitem" onClick={signOut}><Icon name="out" size={18} /> Sign out</button>
              </div>
            )}
          </div>
        </header>
        <div id="content" className="shell-content">{children}</div>
      </div>

      <nav className="tabbar" aria-label="Main">
        {TABS.map((n) => (
          <Link key={n.href} href={n.href} className={n.make ? "tb make" : "tb"} aria-current={current(n.href) ? "page" : undefined} aria-label={n.make ? "Create a reel" : undefined}>
            <span className="pill"><Icon name={n.icon} /></span>
            {n.short ?? n.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
