// Song structure blocks: Intro, Verse, Chorus, Rap and friends, shown as blocks the creator taps to add,
// moves and removes. The lyrics text stays the source of truth: blocks are read from its [tags],
// and every change to a block rewrites the lyrics, so the tags ACE-Step reads always match the blocks.
// Copied word for word to mobile/src/lib/song-structure.ts; a test checks they stay identical.

export const SECTION_KINDS = ["Intro", "Verse", "Pre-Chorus", "Chorus", "Rap", "Drop", "Bridge", "Outro"] as const;
export type SectionKind = (typeof SECTION_KINDS)[number];

// In a duet each block can be sung by the male voice, the female voice, or both together.
export const SINGERS = ["male", "female", "both"] as const;
export type Singer = (typeof SINGERS)[number];

export interface Section {
  // null for any lines written before the first tag.
  kind: SectionKind | null;
  singer: Singer | null;
  body: string;
}

const KIND_BY_NAME: Record<string, SectionKind> = {
  intro: "Intro",
  verse: "Verse",
  "pre-chorus": "Pre-Chorus",
  prechorus: "Pre-Chorus",
  "pre chorus": "Pre-Chorus",
  chorus: "Chorus",
  hook: "Chorus",
  rap: "Rap",
  drop: "Drop",
  "build-up": "Drop",
  bridge: "Bridge",
  outro: "Outro",
};

const TAG = /^\[([^\]]+)\]$/;

// "[Verse 2 - male vocal]" -> Verse, male. Unknown tags (like "[Instrumental]") stay part of the text.
export function parseTag(line: string): { kind: SectionKind; singer: Singer | null } | null {
  const m = TAG.exec(line.trim());
  if (!m) return null;
  const [name, ...rest] = m[1].split(/\s+[-–]\s+|\s*:\s*/);
  const kind = KIND_BY_NAME[name.trim().toLowerCase().replace(/\s*\d+$/, "")];
  if (!kind) return null;
  const who = rest.join(" ").toLowerCase();
  const singer: Singer | null = /both|duet|together/.test(who) ? "both" : /female|woman|girl/.test(who) ? "female" : /male|man|boy/.test(who) ? "male" : null;
  return { kind, singer };
}

export function tagFor(kind: SectionKind, singer: Singer | null): string {
  if (!singer) return `[${kind}]`;
  return `[${kind} - ${singer === "both" ? "male and female vocals together" : `${singer} vocal`}]`;
}

export function parseSections(lyrics: string): Section[] {
  const sections: Section[] = [];
  let current: Section = { kind: null, singer: null, body: "" };
  const lines: string[] = [];
  const flush = () => {
    current.body = lines.join("\n").trim();
    if (current.kind || current.body) sections.push(current);
    lines.length = 0;
  };
  for (const line of lyrics.replace(/\r\n/g, "\n").split("\n")) {
    const tag = parseTag(line);
    if (tag) {
      flush();
      current = { kind: tag.kind, singer: tag.singer, body: "" };
    } else {
      lines.push(line);
    }
  }
  flush();
  return sections;
}

export function joinSections(sections: Section[]): string {
  return sections
    .map((s) => (s.kind ? [tagFor(s.kind, s.singer), s.body].filter(Boolean).join("\n") : s.body))
    .filter(Boolean)
    .join("\n\n");
}

// The blocks shown above the lyrics: only tagged sections.
export function blocksOf(lyrics: string): { kind: SectionKind; singer: Singer | null; empty: boolean }[] {
  return parseSections(lyrics)
    .filter((s) => s.kind)
    .map((s) => ({ kind: s.kind as SectionKind, singer: s.singer, empty: !s.body }));
}

// Indexes below count tagged sections only, the same as blocksOf.
function edit(lyrics: string, fn: (tagged: Section[]) => Section[]): string {
  const all = parseSections(lyrics);
  const head = all.filter((s) => !s.kind);
  return joinSections([...head, ...fn(all.filter((s) => s.kind))]);
}

// A new block reuses the words of an earlier block of the same kind (a repeated chorus sings the same chorus).
export function addSection(lyrics: string, kind: SectionKind, singer: Singer | null = null): string {
  return edit(lyrics, (tagged) => {
    const repeat = kind === "Chorus" ? tagged.find((s) => s.kind === "Chorus" && s.body)?.body ?? "" : "";
    return [...tagged, { kind, singer, body: repeat }];
  });
}

export function removeSection(lyrics: string, index: number): string {
  return edit(lyrics, (tagged) => tagged.filter((_, i) => i !== index));
}

export function moveSection(lyrics: string, index: number, by: -1 | 1): string {
  return edit(lyrics, (tagged) => {
    const to = index + by;
    if (to < 0 || to >= tagged.length || index < 0 || index >= tagged.length) return tagged;
    const next = [...tagged];
    [next[index], next[to]] = [next[to], next[index]];
    return next;
  });
}

export function setSinger(lyrics: string, index: number, singer: Singer | null): string {
  return edit(lyrics, (tagged) => tagged.map((s, i) => (i === index ? { ...s, singer } : s)));
}

// Rap bars go into the first empty [Rap] block, else a new [Rap] block after the first chorus, else at the end.
export function insertRap(lyrics: string, bars: string): string {
  return edit(lyrics, (tagged) => {
    const empty = tagged.findIndex((s) => s.kind === "Rap" && !s.body);
    if (empty >= 0) return tagged.map((s, i) => (i === empty ? { ...s, body: bars.trim() } : s));
    const chorus = tagged.findIndex((s) => s.kind === "Chorus");
    const at = chorus >= 0 ? chorus + 1 : tagged.length;
    return [...tagged.slice(0, at), { kind: "Rap", singer: null, body: bars.trim() }, ...tagged.slice(at)];
  });
}

// The shape a creator starts from: what Simple mode and "Write lyrics with AI" fill in.
export const DEFAULT_STRUCTURE: SectionKind[] = ["Verse", "Chorus", "Verse", "Chorus"];

export function structureOf(lyrics: string): SectionKind[] {
  return blocksOf(lyrics).map((b) => b.kind);
}

// True when the lyrics are only tags, with no words yet.
export function onlyTags(lyrics: string): boolean {
  return parseSections(lyrics).every((s) => !s.body);
}
