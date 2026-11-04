// A reel link (reelkar://reel/<id>, e.g. from Claude's "Open in Reelkar") opened while signed
// out can't route yet: the reel screen is behind sign-in. Keep the id until the entry point
// runs again after sign-in and onboarding, then open the reel.
let pendingReel: string | null = null;

export function rememberReelLink(url: string) {
  const id = /(?:^|\/)reel\/([0-9a-z-]+)/i.exec(url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "/"))?.[1];
  if (id) pendingReel = id;
}

export function takeReelLink(): string | null {
  const id = pendingReel;
  pendingReel = null;
  return id;
}
