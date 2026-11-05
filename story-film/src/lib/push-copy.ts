import { occasionName } from "@/app/g/[token]/copy";
import type { Occasion } from "@/lib/gifts";

// What each push says, in the phone's language (English, Hindi or Arabic, like the gift page).
// Arabic never assumes anyone's gender: the gift line is passive and nothing is an imperative.
export type PushLang = "en" | "hi" | "ar";
export interface PushText {
  title: string;
  body: string;
}

// Song and reel titles can be long; a push shows about two lines.
const short = (t: string) => (t.length > 60 ? `${t.slice(0, 59)}…` : t);

export function songReadyText(lang: PushLang, title: string): PushText {
  const t = short(title);
  if (lang === "hi") return { title: "आपका गाना तैयार है", body: `"${t}" सुनने के लिए तैयार है।` };
  if (lang === "ar") return { title: "أغنيتك جاهزة", body: `«${t}» جاهزة للاستماع.` };
  return { title: "Your song is ready", body: `"${t}" is ready to play.` };
}

export function songFailedText(lang: PushLang, title: string): PushText {
  const t = short(title);
  if (lang === "hi") return { title: "आपका गाना नहीं बन पाया", body: `"${t}" नहीं बन पाया। वजह देखने के लिए टैप करें।` };
  if (lang === "ar") return { title: "تعذّر إنشاء أغنيتك", body: `لم تكتمل «${t}». التفاصيل في التطبيق.` };
  return { title: "Your song didn't work", body: `"${t}" couldn't be made. Tap to see why.` };
}

export function reelReadyText(lang: PushLang, title: string | null): PushText {
  if (lang === "hi") return { title: "आपकी रील तैयार है", body: title ? `"${short(title)}" पोस्ट करने के लिए तैयार है।` : "पोस्ट करने के लिए तैयार है।" };
  if (lang === "ar") return { title: "مقطعك جاهز", body: title ? `«${short(title)}» جاهز للنشر.` : "جاهز للنشر." };
  return { title: "Your reel is ready", body: title ? `"${short(title)}" is ready to post.` : "It's ready to post." };
}

export function reelFailedText(lang: PushLang): PushText {
  if (lang === "hi") return { title: "आपकी रील नहीं बन पाई", body: "वजह देखने के लिए टैप करें।" };
  if (lang === "ar") return { title: "تعذّر إنشاء مقطعك", body: "التفاصيل في التطبيق." };
  return { title: "Your reel didn't work", body: "Tap to see why." };
}

// design/community/flow-spec.md G6: "Priya opened your gift", on the first open only.
export function giftOpenedText(lang: PushLang, toName: string, occasion: Occasion): PushText {
  const to = short(toName);
  const plain = occasion === "just_because";
  if (lang === "hi")
    return { title: `${to} ने आपका तोहफ़ा खोल लिया`, body: plain ? "आपका गाना पहुँच गया।" : `आपका ${occasionName("hi", occasion)} वाला गाना पहुँच गया।` };
  if (lang === "ar") return { title: `تم فتح هديتك إلى ${to}`, body: plain ? "وصلت أغنيتك." : `وصلت أغنيتك بمناسبة ${occasionName("ar", occasion)}.` };
  return { title: `${to} opened your gift`, body: plain ? "Your song has been played." : `Your ${occasionName("en", occasion)} song has been played.` };
}
