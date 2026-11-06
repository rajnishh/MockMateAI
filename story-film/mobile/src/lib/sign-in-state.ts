// Sign-in has to survive the phone being locked or the app going to the background while
// someone reads their code. Kept free of React Native imports so the web tests can run it.

// better-auth refetches the session each time the app comes back to the front, and while
// signed out it reports that refetch as "pending" again. Only the first load counts: once the
// app is ready it stays ready, so the navigator isn't swapped for the splash and rebuilt at
// Welcome, which would throw away the sign-in screens.
export function nextReady(wasReady: boolean, loaded: boolean, remotePending: boolean): boolean {
  return wasReady || (loaded && !remotePending);
}

// A code that was sent, kept for a short time in case iOS closes the app in the background.
export interface PendingSignIn {
  // A mobile number in E.164 form or an email address.
  to: string;
  sentAt: number;
}

// Codes stop working after a few minutes; past this, starting again is clearer than a stale step.
export const PENDING_SIGN_IN_TTL_MS = 10 * 60_000;
// How long the code screen waits before offering to resend.
export const RESEND_WAIT_S = 30;

export function encodePendingSignIn(to: string, now = Date.now()): string {
  return JSON.stringify({ to, sentAt: now } satisfies PendingSignIn);
}

export function decodePendingSignIn(raw: string | null, now = Date.now()): PendingSignIn | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Partial<PendingSignIn>;
    if (typeof p.to !== "string" || !p.to || typeof p.sentAt !== "number") return null;
    if (now < p.sentAt || now - p.sentAt > PENDING_SIGN_IN_TTL_MS) return null;
    return { to: p.to, sentAt: p.sentAt };
  } catch {
    return null;
  }
}

// Seconds left before resend, counted from when the code was sent so a reopened app doesn't reset it.
export function resendWait(sentAt: number | undefined, now = Date.now()): number {
  if (sentAt === undefined) return RESEND_WAIT_S;
  return Math.max(0, Math.min(RESEND_WAIT_S, RESEND_WAIT_S - Math.floor((now - sentAt) / 1000)));
}
