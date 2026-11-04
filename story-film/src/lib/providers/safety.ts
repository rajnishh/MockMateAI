import type { ImageProvider } from "./types";

// An image model refused a prompt as unsafe (Cloudflare code 8007, fal
// content_policy_violation). These filters misfire on everyday scenes, and
// Cloudflare's gives different answers for the same prompt, so callers retry.
export class ImageSafetyError extends Error {
  constructor(detail: string) {
    super(`Image prompt blocked by the safety filter: ${detail}`);
    this.name = "ImageSafetyError";
  }
}

// Words image filters commonly flag in innocent prompts, with family-friendly
// stand-ins that keep the scene. Matched as whole words, case-insensitively.
const SAFER_WORDS: [RegExp, string][] = [
  [/\b(?:naked|nude|bare-?(?:chested|skinned|foot(?:ed)?)|shirtless|topless|undressed|unclothed)\b/gi, "fully clothed"],
  [/\b(?:sexy|seductive|sensual|sultry|provocative|alluring|steamy|intimate)\b/gi, "cheerful"],
  [/\b(?:lingerie|underwear|bikini|swimsuit|swimwear|nightgown|pyjamas|pajamas)\b/gi, "comfortable clothes"],
  [/\bbath ?time\b/gi, "splash time"],
  [/\bbathing\b/gi, "washing up"],
  [/\b(?:bathtub|bath)\b/gi, "wash basin"],
  [/\b(?:in|on) (?:the |a |their |his |her )?bed\b/gi, "in a cozy room"],
  [/\bbedroom\b/gi, "room"],
  [/\b(?:kiss(?:es|ing)?|caress(?:es|ing)?)\b/gi, "smiling together"],
  [/\b(?:toddlers?|infants?|bab(?:y|ies)|newborns?)\b/gi, "little child"],
  [/\b(?:teenagers?|teens?)\b/gi, "young person"],
  [/\ba young adult\b/gi, "an adult"],
  [/\byoung adult\b/gi, "adult"],
];

const FAMILY_FRIENDLY = "fully clothed, modest everyday outfit, wholesome and family-friendly";

// Swaps known trigger words only, so a script's look stays as written.
export function cleanImagePrompt(prompt: string): string {
  return SAFER_WORDS.reduce((p, [re, safe]) => p.replace(re, safe), prompt);
}

// The retry prompt: trigger words swapped and an explicit family-friendly cue.
export function saferImagePrompt(prompt: string): string {
  const cleaned = cleanImagePrompt(prompt);
  return cleaned.includes(FAMILY_FRIENDLY) ? cleaned : `${cleaned}, ${FAMILY_FRIENDLY}`;
}

type KeyframeInput = Parameters<ImageProvider["generateKeyframe"]>[0];

// Tries the prompt, then once with a safer rewrite. Returns null when both are
// blocked so the caller can reuse a neighbouring picture; other errors throw.
export async function generateKeyframeSafely(
  image: ImageProvider,
  input: KeyframeInput,
  log: (msg: string) => void = console.warn,
): Promise<{ url: string } | null> {
  try {
    return await image.generateKeyframe(input);
  } catch (err) {
    if (!(err instanceof ImageSafetyError)) throw err;
  }
  const prompt = saferImagePrompt(input.prompt);
  log(`Image blocked by the safety filter; retrying with a safer prompt: "${input.prompt}"`);
  try {
    return await image.generateKeyframe({ ...input, prompt });
  } catch (err) {
    if (!(err instanceof ImageSafetyError)) throw err;
    log(`Safer prompt was blocked too; reusing a neighbouring picture for: "${input.prompt}"`);
    return null;
  }
}

// Shots whose picture was blocked reuse the previous picture (or the next one
// for the opening shot). Throws when every picture was blocked.
export function fillBlockedFrames<T>(frames: (T | null)[]): T[] {
  const firstOk = frames.find((f) => f !== null);
  if (firstOk === undefined || firstOk === null) throw new ImageSafetyError("every picture for this reel was blocked");
  let last: T = firstOk;
  return frames.map((f) => (last = f ?? last));
}
