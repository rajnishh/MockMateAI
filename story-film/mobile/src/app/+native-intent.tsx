import { createPromptPath } from "@/lib/pending-link";

// reelkar://create?prompt=… (from Siri, Shortcuts, Gemini or any app) opens "Here's what I heard" with the
// prompt filled in. Nothing is made until the creator taps Make it. Other links route as usual.
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  return createPromptPath(path) ?? path;
}
