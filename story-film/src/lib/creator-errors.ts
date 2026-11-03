import { isGarbledScript } from "@/lib/pipeline/script";
import { ImageSafetyError } from "@/lib/providers/safety";

export const SAFETY_BLOCKED_MESSAGE = "A picture for this reel was blocked by the safety filter. Try rewording your idea.";

// "<service> <status>" as our providers word their HTTP errors, e.g. "Cloudflare AI 400: {...}".
const PROVIDER_STATUS = /^(?:Cloudflare AI|fal|LLM|Kokoro|Sarvam TTS|Whisper|Transcription|ACE-Step|Seed-VC) (\d{3})\b/;

// What a creator reads when a reel fails: provider errors (raw JSON from
// Cloudflare, fal, etc.) become plain sentences; our own messages pass through.
export function creatorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (err instanceof ImageSafetyError || /NSFW|content_policy_violation|"code":8007/i.test(message)) return SAFETY_BLOCKED_MESSAGE;
  if (isGarbledScript(err) || /^LLM reply was cut off/.test(message)) {
    return "The script for this reel came out garbled. Please try making it again.";
  }
  const status = Number(message.match(PROVIDER_STATUS)?.[1]);
  // 4006: Workers AI's free daily allowance is used up.
  if (status === 429 || /"code":4006/.test(message)) return "Reelkar's AI service is busy right now. Please try again in a little while.";
  if (status === 401 || status === 403) return "Reelkar couldn't reach its AI service. Please try again later.";
  if (status || /^fal .* (timed out|ended with status)/.test(message)) return "Reelkar's AI service had a problem. Please try making it again.";
  return message.slice(0, 500);
}
