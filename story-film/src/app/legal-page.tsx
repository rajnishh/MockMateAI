import Link from "next/link";
import type { ReactNode } from "react";
import { ReelLogo } from "./reel-logo";
import styles from "./legal.module.css";

// Shared frame for /privacy, /terms and /support.
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <div className={styles.page}>
      <Link href="/" className={styles.top}>
        <ReelLogo size={28} label="Reelkar" />
        <span>Reelkar</span>
      </Link>
      <main className={styles.main}>
        <h1>{title}</h1>
        <p className={styles.updated}>Last updated {updated}</p>
        {children}
        <nav className={styles.nav} aria-label="Legal">
          <Link href="/privacy">Privacy policy</Link>
          <Link href="/terms">Terms of use</Link>
          <Link href="/support">Help and support</Link>
        </nav>
      </main>
    </div>
  );
}

export function Contact({ email }: { email?: string }) {
  return email ? <a href={`mailto:${email}`}>{email}</a> : <>the Send feedback link in the app (You → Settings)</>;
}
