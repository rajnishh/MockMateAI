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

// reelkar://create?prompt=… -> the "Hum it" confirm screen with the prompt; null for other links.
export function createPromptPath(url: string): string | null {
  if (!/^(?:[a-z][a-z0-9+.-]*:\/\/|\/)?create\/?\?/i.test(url.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/?]*\/(?=create)/i, ""))) return null;
  const raw = /[?&]prompt=([^&#]*)/.exec(url)?.[1];
  if (!raw) return null;
  let prompt: string;
  try {
    prompt = decodeURIComponent(raw.replace(/\+/g, " ")).trim().slice(0, 500);
  } catch {
    return null;
  }
  return prompt ? `/hum/confirm?prompt=${encodeURIComponent(prompt)}` : null;
}

// Same as reel links: a create prompt opened while signed out waits until they're in.
let pendingPrompt: string | null = null;

export function rememberCreateLink(url: string) {
  pendingPrompt = createPromptPath(url) ?? pendingPrompt;
}

export function takeCreateLink(): string | null {
  const path = pendingPrompt;
  pendingPrompt = null;
  return path;
}
