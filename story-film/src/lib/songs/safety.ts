import { z } from "zod";
import type { LlmProvider } from "@/lib/providers/types";

// Songs must never imitate or name real singers or musicians: Indian courts
// protect artists' voices and likeness (personality rights), and platforms
// remove such uploads. A fast name list catches the obvious cases; an LLM
// check catches the rest (other names, spellings, "sounds like ..." requests).
const BLOCKED_ARTISTS = [
  "arijit singh", "lata mangeshkar", "asha bhosle", "kishore kumar", "mohammed rafi", "mukesh",
  "shreya ghoshal", "sonu nigam", "kumar sanu", "udit narayan", "alka yagnik", "sunidhi chauhan",
  "neha kakkar", "atif aslam", "jubin nautiyal", "armaan malik", "darshan raval", "b praak",
  "a r rahman", "ar rahman", "rahman", "pritam", "vishal shekhar", "shankar mahadevan", "kailash kher",
  "diljit dosanjh", "sidhu moose wala", "sidhu moosewala", "ap dhillon", "karan aujla", "guru randhawa",
  "badshah", "honey singh", "yo yo honey singh", "divine", "raftaar", "king", "mc stan", "emiway",
  "anuv jain", "prateek kuhad", "nusrat fateh ali khan", "rahat fateh ali khan", "jagjit singh",
  "amitabh bachchan", "anil kapoor", "shah rukh khan", "salman khan",
  "taylor swift", "ed sheeran", "drake", "beyonce", "rihanna", "justin bieber", "ariana grande",
  "billie eilish", "the weeknd", "eminem", "adele", "bruno mars", "dua lipa", "bts", "blackpink",
  "michael jackson", "elvis", "frank sinatra", "lady gaga", "kanye west", "travis scott", "bad bunny",
];

function normalise(text: string): string {
  return ` ${text.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, " ").trim()} `;
}

export function findBlockedArtist(text: string): string | undefined {
  const hay = normalise(text);
  return BLOCKED_ARTISTS.find((name) => hay.includes(normalise(name)));
}

const verdictSchema = z.object({ realPerson: z.boolean(), name: z.string().nullish() });

export function buildRealArtistCheckPrompt(texts: string[], people: string[] = []): string {
  return [
    "You check requests for an AI song generator.",
    "Does the text below name, or ask to imitate the voice or style of, a specific real singer, rapper, band,",
    "composer or celebrity? Generic genres, instruments, moods, places and fictional characters are fine.",
    "Songs for friends and family are fine too: a first name of the person the song is for or from is not an artist.",
    ...(people.length ? [`These names are private people this song is for or from, not artists: ${people.join(", ")}.`] : []),
    'Reply with JSON only: {"realPerson": boolean, "name": string | null}',
    "",
    ...texts.map((t, i) => `Text ${i + 1}: ${t}`),
  ].join("\n");
}

export class SongSafetyError extends Error {}

// Throws SongSafetyError when a request targets a real artist. If the LLM check
// itself fails, the request is refused rather than let through unchecked.
// people: names known to be private people (a gift's sender), so a friend called Mukesh isn't
// taken for the singer.
export async function assertNoRealArtists(llm: LlmProvider, texts: string[], people: string[] = []): Promise<void> {
  const parts = texts.filter((t) => t.trim());
  people = people.map((p) => p.trim()).filter(Boolean);
  const known = people.map(normalise).filter((n) => n.trim());
  const hit = parts.map((t) => findBlockedArtist(known.reduce((text, n) => normalise(text).replaceAll(n, " "), t))).find(Boolean);
  if (hit) throw new SongSafetyError(`Songs can't use or imitate real artists ("${hit}"). Pick a genre style instead.`);
  let verdict;
  try {
    verdict = verdictSchema.parse(await llm.completeJson(buildRealArtistCheckPrompt(parts, people)));
  } catch {
    throw new Error("Couldn't check this request right now. Please try again.");
  }
  if (verdict.realPerson) {
    throw new SongSafetyError(
      `Songs can't use or imitate real artists${verdict.name ? ` ("${verdict.name}")` : ""}. Pick a genre style instead.`,
    );
  }
}
