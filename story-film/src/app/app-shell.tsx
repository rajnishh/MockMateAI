"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { ReelLogo } from "./reel-logo";

// The v2.0 web chrome: a sidebar from 768px (icons only below 1024px), a bottom tab bar on phones,
// and a top bar with credits and the account menu. Sign-in has no chrome.

const ICONS: Record<string, ReactNode> = {
  create: <path d="M12 5v14M5 12h14" />,
  songs: <><path d="M9 18V5l11-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="17" cy="16" r="3" /></>,
  ask: <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  credits: <><circle cx="12" cy="12" r="9" /><path d="M9 9.5c0-1.4 1.3-2.5 3-2.5s3 1 3 2.3c0 2.9-6 1.8-6 4.9 0 1.3 1.3 2.3 3 2.3s3-1.1 3-2.5M12 5v2M12 17v2" /></>,
  connect: <><path d="M9 7V3M15 7V3" /><path d="M6 7h12v4a6 6 0 0 1-12 0z" /><path d="M12 17v4" /></>,
  out: <><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M10 17l-5-5 5-5M5 12h11" /></>,
};

export function Icon({ name, size = 22 }: { name: keyof typeof ICONS; size?: number }) {
  return (
    <svg className="ic" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}

const NAV = [
  { href: "/", label: "Create", icon: "create" },
  { href: "/songs", label: "Songs", icon: "songs" },
  { href: "/ask", label: "Ask Reelkar", short: "Ask", icon: "ask" },
  { href: "/calendar", label: "Calendar", icon: "calendar" },
  { href: "/billing", label: "Credits", icon: "credits" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { data: session } = authClient.useSession();
  const [credits, setCredits] = useState<number | null>(null);
  const [menu, setMenu] = useState(false);
  const bare = path === "/login";

  useEffect(() => {
    if (bare) return;
    fetch("/api/billing")
      .then(async (r) => r.ok && setCredits((await r.json()).balance))
      .catch(() => {});
  }, [bare, path]);

  useEffect(() => setMenu(false), [path]);

  if (bare) return <>{children}</>;

  const current = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  const who = session?.user.name || session?.user.phoneNumber || session?.user.email || "";
  const initial = (session?.user.name?.[0] ?? "R").toUpperCase();

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
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className={n.href === "/" ? "nv make" : "nv"} aria-current={current(n.href) ? "page" : undefined} title={n.label}>
            <Icon name={n.icon} />
            <span>{n.label}</span>
          </Link>
        ))}
        <p className="grp">Tools</p>
        <Link href="/connect" className="nv" aria-current={current("/connect") ? "page" : undefined} title="Connect AI">
          <Icon name="connect" />
          <span>Connect AI</span>
        </Link>
      </nav>

      <div className="shell-main">
        <header className="topbar">
          <Link href="/" className="topbar-brand" aria-label="Reelkar home">
            <ReelLogo size={32} />
            <span>Reelkar</span>
          </Link>
          <Link href="/billing" className="credits">
            <Icon name="credits" size={18} />
            {credits === null ? "Credits" : `${credits} credits`}
          </Link>
          <div className="acct">
            <button type="button" className="av" aria-haspopup="menu" aria-expanded={menu} aria-label="Account" onClick={() => setMenu((m) => !m)}>
              {initial}
            </button>
            {menu && (
              <div className="menu" role="menu">
                {who && <p className="menu-who">{who}</p>}
                <Link href="/connect" role="menuitem"><Icon name="connect" size={18} /> Connect AI</Link>
                <button type="button" role="menuitem" onClick={signOut}><Icon name="out" size={18} /> Sign out</button>
              </div>
            )}
          </div>
        </header>
        <div id="content" className="shell-content">{children}</div>
      </div>

      <nav className="tabbar" aria-label="Main">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className="tb" aria-current={current(n.href) ? "page" : undefined}>
            <span className="pill"><Icon name={n.icon} /></span>
            {"short" in n ? n.short : n.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
