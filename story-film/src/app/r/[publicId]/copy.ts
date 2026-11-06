import type { PageLang } from "@/app/g/[token]/copy";

// The public recipe page's words (design/community/recipes-spec.md, Copy). The Report dialog's
// come from the gift page's copy. Arabic arrows point the reading way ("←").
type Format = "story" | "motion" | "dance" | "edit";
type Role = "hook" | "beat" | "turn" | "payoff" | "cta";

export function recipeCopy(lang: PageLang) {
  if (lang === "hi")
    return {
      overline: "रील रेसिपी",
      by: (h: string) => `@${h} की रेसिपी`,
      made: (n: number) => `${n.toLocaleString("en-IN")} रीलें बनीं`,
      youBring: "आप लाएँ",
      bringTopic: "आपका विषय",
      bringPhoto: "आपकी फ़ोटो (चाहें तो)",
      bringVideo: "आपका वीडियो",
      bringLang: "आपकी भाषा",
      has: "रेसिपी में है",
      look: "लुक",
      shape: "स्क्रिप्ट का ढाँचा",
      shapeValue: (first: string, n: number, last: string) => `${first} → ${n} हिस्से → ${last}`,
      music: "म्यूज़िक: इसी रील की धुन",
      length: "लंबाई",
      sec: (n: number) => `${n} से.`,
      priceFree: (n: number) => `स्टैंडर्ड में मुफ़्त (हफ़्ते में ${n} मुफ़्त रीलें)`,
      pricePaid: (c: number, q: string) => `${q} में ${c} क्रेडिट`,
      or: "या",
      earns: "लोग किसी रेसिपी पर जो ख़रीदे हुए क्रेडिट खर्च करते हैं, उसका 10% बनाने वाले को मिलता है।",
      use: "यह रेसिपी इस्तेमाल करें",
      more: (f: string) => `${f} की और रेसिपी`,
      byMaker: (h: string) => `@${h} की और रेसिपी`,
      stopped: "यह रेसिपी अब शेयर नहीं है। बनाने वाले ने शेयर करना बंद कर दिया।",
      removed: "शिकायत के बाद यह रेसिपी हटा दी गई।",
      seeMore: "और रेसिपी देखें",
      getApp: "ऐप पाएँ",
      previewFailed: "प्रीव्यू लोड नहीं हुआ। फिर से कोशिश करने के लिए टैप करें।",
      lookCard: "इस रेसिपी का लुक",
      reportTitle: "इस रेसिपी की शिकायत करें",
      kids: "बच्चों के लिए",
      quality: { standard: "स्टैंडर्ड", premium: "AI एनिमेशन", cinematic: "सिनेमैटिक" } as Record<string, string>,
      format: { story: "तस्वीरों वाली कहानी", motion: "मोशन रील", dance: "बच्चों का डांस", edit: "मेरा वीडियो एडिट" } as Record<Format, string>,
      role: { hook: "हुक", beat: "हिस्सा", turn: "मोड़", payoff: "अंत", cta: "अपील" } as Record<Role, string>,
    };
  if (lang === "ar")
    return {
      overline: "وصفة ريل",
      by: (h: string) => `من @${h}`,
      made: (n: number) => `${n.toLocaleString("ar")} ريل صُنع بها`,
      youBring: "ما تضيفه أنت",
      bringTopic: "موضوعك",
      bringPhoto: "صورتك (اختياري)",
      bringVideo: "الفيديو الخاص بك",
      bringLang: "لغتك",
      has: "ما في الوصفة",
      look: "الشكل",
      shape: "هيكل النص",
      shapeValue: (first: string, n: number, last: string) => `${first} ← ${n} مشاهد ← ${last}`,
      music: "الموسيقى: لحن هذا الريل",
      length: "المدة",
      sec: (n: number) => `${n} ث`,
      priceFree: (n: number) => `مجانًا بالجودة العادية (${n} ريلات مجانية أسبوعيًا)`,
      pricePaid: (c: number, q: string) => `${c} رصيد بجودة ${q}`,
      or: "أو",
      earns: "يكسب صانع الوصفة 10% من الرصيد المدفوع الذي يُنفق عليها.",
      use: "استخدام هذه الوصفة",
      more: (f: string) => `وصفات أخرى لـ ${f}`,
      byMaker: (h: string) => `المزيد من @${h}`,
      stopped: "لم تعد هذه الوصفة متاحة. أوقف صانعها مشاركتها.",
      removed: "أُزيلت هذه الوصفة بعد بلاغ.",
      seeMore: "عرض وصفات أخرى",
      getApp: "حمّل التطبيق",
      previewFailed: "لم تُحمَّل المعاينة. اضغط للمحاولة مجددًا.",
      lookCard: "شكل هذه الوصفة",
      reportTitle: "الإبلاغ عن هذه الوصفة",
      kids: "للأطفال",
      quality: { standard: "عادية", premium: "رسوم متحركة بالذكاء الاصطناعي", cinematic: "سينمائية" } as Record<string, string>,
      format: { story: "قصة بالصور", motion: "ريل متحرك", dance: "رقص للأطفال", edit: "تعديل الفيديو" } as Record<Format, string>,
      role: { hook: "افتتاحية", beat: "مشهد", turn: "تحوّل", payoff: "خاتمة", cta: "دعوة" } as Record<Role, string>,
    };
  return {
    overline: "A reel recipe",
    by: (h: string) => `by @${h}`,
    made: (n: number) => `${n.toLocaleString("en-IN")} ${n === 1 ? "reel" : "reels"} made with it`,
    youBring: "You bring",
    bringTopic: "Your topic",
    bringPhoto: "Your photo (optional)",
    bringVideo: "Your video",
    bringLang: "Your language",
    has: "The recipe has",
    look: "Look",
    shape: "Script shape",
    shapeValue: (first: string, n: number, last: string) => `${first} → ${n} beats → ${last}`,
    music: "Music: this reel's track",
    length: "Length",
    sec: (n: number) => `${n} s`,
    priceFree: (n: number) => `Free with Standard (${n} free reels a week)`,
    pricePaid: (c: number, q: string) => `${c} credits with ${q}`,
    or: "or",
    earns: "Makers earn 10% of the paid credits people spend on their recipes.",
    use: "Use this recipe",
    more: (f: string) => `More recipes for ${f}`,
    byMaker: (h: string) => `More by @${h}`,
    stopped: "This recipe isn't shared any more. The maker stopped sharing it.",
    removed: "This recipe was removed after a report.",
    seeMore: "See more recipes",
    getApp: "Get the app",
    previewFailed: "The preview didn't load. Tap to try again.",
    lookCard: "This recipe's look",
    reportTitle: "Report this recipe",
    kids: "For kids",
    quality: { standard: "Standard", premium: "AI animation", cinematic: "Cinematic" } as Record<string, string>,
    format: { story: "Story", motion: "Motion reel", dance: "Kids dance", edit: "Edit my video" } as Record<Format, string>,
    role: { hook: "Hook", beat: "Beat", turn: "Turn", payoff: "Payoff", cta: "Call to action" } as Record<Role, string>,
  };
}

export type RecipeCopy = ReturnType<typeof recipeCopy>;

// The link preview's title and text (og:title, og:description).
export function recipePreviewText(name: string, handle: string): { title: string; description: string } {
  return { title: `${name}: a reel recipe by @${handle}`, description: "Make your own version on Reelkar. Made with AI." };
}
