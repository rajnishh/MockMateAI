import type { RemixBlock, RemixKind } from "./api";

// Remix chains and earnings in the app (design/community/remix-spec.md; the server side is
// story-film/src/lib/remixes.ts and src/lib/billing/earnings.ts).

// The short pill on a remix row ("Cover", "Extended", "Rap").
export const KIND_PILL: Record<string, string> = { cover: "Cover", extend: "Extended", rap: "Rap", replace: "New part", "add-vocals": "New words", "add-instrumental": "New beat" };
export const kindPill = (kind: RemixKind | null) => (kind ? (KIND_PILL[kind] ?? kind) : "Original");

// The Remix screen's names for someone else's song; the Studio keeps its own.
export const OPEN_KIND_TEXT: Record<string, { label: string; help: string; verb: string }> = {
  cover: { label: "Cover", help: "Sing it again in another style.", verb: "Make cover" },
  extend: { label: "Extend", help: "Make it longer. Write the new lines.", verb: "Make it longer" },
  rap: { label: "Rap over it", help: "Pick a part. AI writes the bars, or you do.", verb: "Make rap" },
  "add-vocals": { label: "New words", help: "Your words on this music.", verb: "Make new words" },
  "add-instrumental": { label: "New beat", help: "New music under these vocals.", verb: "Make new beat" },
};

// What a remix of `kind` is called in a sentence ("a cover of", "a rap over").
export const KIND_NOUN: Record<string, string> = { cover: "cover", extend: "longer version", rap: "rap", replace: "remix", "add-vocals": "new-words version", "add-instrumental": "new-beat version" };

export function blockedText(block: RemixBlock, handle: string): string {
  switch (block) {
    case "off":
      return `@${handle} has turned off remixes for this song.`;
    case "ownVoice":
      return `This song is sung in @${handle}'s own voice, so it can't be remixed.`;
    case "tooLong":
      return "This song is longer than 4 minutes, so it can't be remixed.";
    case "notPublic":
      return "This song isn't public any more.";
    default:
      return "This is your own song. Remix it in Song Studio.";
  }
}

// Hundredths of a credit as the app shows them: "0.1", "2.3", "1.0", two decimals only when needed ("0.08").
export function creditAmount(hundredths: number): string {
  return (hundredths / 100).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 });
}

// "+0.1", with the sign where the language puts it.
export function plusAmount(hundredths: number): string {
  return (hundredths / 100).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2, signDisplay: "always" });
}

export const earnPercent = (rateBp: number) => `${(rateBp / 100).toLocaleString()}%`;

export const remixWord = (n: number) => `${n} ${n === 1 ? "remix" : "remixes"}`;
