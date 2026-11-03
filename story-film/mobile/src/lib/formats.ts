// What each kind of reel is called in the app (Film.format and agent cards).
const FORMAT_LABEL: Record<string, string> = {
  story: "Story",
  motion: "Motion reel",
  dance: "Kids dance",
  edit: "Video edit",
  music: "Music video",
};

// The text a reel is made from: the hook goes first so the script opens with it
// (same rule as ideaBrief in the web app's src/lib/suggestions.ts).
export function ideaBrief(i: { title: string; hook?: string; idea: string }): string {
  if (!i.hook) return `${i.title}. ${i.idea}`;
  return /[.!?।؟…"”]$/.test(i.hook) ? `${i.hook} ${i.idea}` : `${i.hook}. ${i.idea}`;
}

export function formatLabel(format?: string | null): string | null {
  return format ? (FORMAT_LABEL[format] ?? null) : null;
}
