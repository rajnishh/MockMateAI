// Where to go after signing in: a path on this site only (the connector's consent screen uses it).
// Browsers drop tabs and newlines from URLs ("/\t/evil.com" becomes "//evil.com"), so control
// characters and backslashes are refused outright, and the path must stay on this origin once parsed.
export function safeNext(next: unknown): string {
  if (typeof next !== "string" || !next.startsWith("/") || /[\u0000-\u001f\u007f\\]/.test(next)) return "/";
  const base = "http://reelkar.invalid";
  try {
    return new URL(next, base).origin === base && !next.startsWith("//") ? next : "/";
  } catch {
    return "/";
  }
}
