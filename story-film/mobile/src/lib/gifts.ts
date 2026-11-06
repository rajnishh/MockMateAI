import * as Clipboard from "expo-clipboard";
import * as Linking from "expo-linking";
import { Share } from "react-native";

import type { Occasion } from "./api";

// Song gifts: a song sent as a link, mostly on WhatsApp (story-film/design/community/flow-spec.md).

export const OCCASIONS: { value: Occasion; label: string; emoji: string }[] = [
  { value: "birthday", label: "Birthday", emoji: "🎂" },
  { value: "wedding", label: "Wedding", emoji: "💍" },
  { value: "eid", label: "Eid", emoji: "🌙" },
  { value: "diwali", label: "Diwali", emoji: "🪔" },
  { value: "anniversary", label: "Anniversary", emoji: "💐" },
  { value: "rakhi", label: "Rakhi", emoji: "🧵" },
  { value: "just_because", label: "Just because", emoji: "🎶" },
];

export const occasionLabel = (o: Occasion) => OCCASIONS.find((x) => x.value === o)?.label ?? "Gift";

// Picks the occasion from the song's title or topic when it's obvious ("a birthday song for my sister").
export function guessOccasion(text: string): Occasion {
  const t = text.toLowerCase();
  if (/birthday|janamdin|janmdin|जन्मदिन|عيد ميلاد/.test(t)) return "birthday";
  if (/wedding|shaadi|shadi|शादी|زفاف/.test(t)) return "wedding";
  if (/\beid\b|ईद|عيد/.test(t)) return "eid";
  if (/diwali|deepawali|दिवाली/.test(t)) return "diwali";
  if (/anniversary|saalgirah|सालगिरह/.test(t)) return "anniversary";
  if (/rakhi|raksha|राखी/.test(t)) return "rakhi";
  return "birthday";
}

// The WhatsApp message; the sender can still change it there. The note isn't in it (it's a surprise).
export function giftMessage(toName: string, occasion: Occasion, url: string): string {
  const emoji = OCCASIONS.find((x) => x.value === occasion)?.emoji ?? "🎶";
  const what = occasion === "just_because" ? "a song" : `a ${occasionLabel(occasion).toLowerCase()} song`;
  return `${toName}, I made you ${what} ${emoji} Open it here: ${url}`;
}

// WhatsApp first: the app if it's there, else WhatsApp on the web.
export async function sendOnWhatsApp(text: string): Promise<void> {
  const q = encodeURIComponent(text);
  try {
    await Linking.openURL(`whatsapp://send?text=${q}`);
  } catch {
    await Linking.openURL(`https://wa.me/?text=${q}`);
  }
}

export async function copyLink(url: string): Promise<void> {
  await Clipboard.setStringAsync(url);
}

export async function shareMore(text: string, url: string): Promise<void> {
  await Share.share({ message: text, url });
}

// The account's name to sign gifts with, unless it's the "Creator 1234" placeholder phone sign-ups get.
export function signName(accountName: string | undefined): string {
  const name = (accountName ?? "").trim();
  return /^Creator \d{4}$/.test(name) ? "" : name;
}

// A reply being made: set by Inbox's "Reply", read by Hum it's screens, cleared when it's made.
export interface ReplyContext {
  token: string;
  toName: string;
  occasion: Occasion;
}
let reply: ReplyContext | null = null;
export const replyContext = {
  set: (r: ReplyContext) => {
    reply = r;
  },
  get: () => reply,
  clear: () => {
    reply = null;
  },
};
