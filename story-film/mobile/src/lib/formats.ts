// What each kind of reel is called in the app (Film.format and agent cards).
const FORMAT_LABEL: Record<string, string> = {
  story: "Story",
  motion: "Motion reel",
  dance: "Kids dance",
  edit: "Video edit",
  music: "Music video",
};

export function formatLabel(format?: string | null): string | null {
  return format ? (FORMAT_LABEL[format] ?? null) : null;
}
