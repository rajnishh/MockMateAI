// Jugalbandi: the part being recorded with Hum it. Set by the duet screens, read by Hum it's record
// screen (which sends the take to the duet instead of "Here's what I heard"), cleared when it's sent.
export interface DuetPartContext {
  id: string;
  // The other person, for the banner ("Answer Arjun").
  otherName: string;
  // Their part, to listen to before singing (a path on the server); null for the first part.
  otherPart: string | null;
}
let part: DuetPartContext | null = null;
export const duetPart = {
  set: (p: DuetPartContext) => {
    part = p;
  },
  get: () => part,
  clear: () => {
    part = null;
  },
};

export function inviteMessage(url: string): string {
  return `Sing a Jugalbandi with me on Reelkar 🎤 Hear my part and sing yours: ${url}`;
}

export function hoursLeft(iso: string | null): string {
  if (!iso) return "";
  const h = Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 3600000));
  return h <= 1 ? "less than an hour" : `${h} hours`;
}
