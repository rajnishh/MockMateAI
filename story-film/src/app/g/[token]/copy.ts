import type { Occasion } from "@/lib/gifts";

// The public gift page in the recipient's language (from the browser): English, Hindi or Arabic.
// Arabic wording follows the sender's "her / him" choice, and is neutral when it wasn't set; it never
// assumes the sender's gender (no "صنع/صنعت"), so lines about them use nouns.
export type PageLang = "en" | "hi" | "ar";
type Address = "her" | "him" | null;

export function pickLang(acceptLanguage: string | null): PageLang {
  for (const part of (acceptLanguage ?? "").split(",")) {
    const code = part.trim().slice(0, 2).toLowerCase();
    if (code === "en" || code === "hi" || code === "ar") return code;
  }
  return "en";
}

const OCCASIONS: Record<PageLang, Record<Occasion, string>> = {
  en: { birthday: "birthday", wedding: "wedding", eid: "Eid", diwali: "Diwali", anniversary: "anniversary", rakhi: "Rakhi", just_because: "just because" },
  hi: { birthday: "जन्मदिन", wedding: "शादी", eid: "ईद", diwali: "दिवाली", anniversary: "सालगिरह", rakhi: "राखी", just_because: "बस यूँ ही" },
  ar: { birthday: "عيد ميلاد", wedding: "زفاف", eid: "العيد", diwali: "ديوالي", anniversary: "ذكرى سنوية", rakhi: "راخي", just_because: "بلا مناسبة" },
};

export function occasionName(lang: PageLang, o: Occasion): string {
  return OCCASIONS[lang][o];
}

// For a label on its own ("Birthday"), not inside a sentence.
export function occasionTitle(lang: PageLang, o: Occasion): string {
  const name = OCCASIONS[lang][o];
  return name.charAt(0).toUpperCase() + name.slice(1);
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function copy(lang: PageLang, address: Address = null) {
  const her = address === "her";
  const him = address === "him";
  if (lang === "hi")
    return {
      overline: "आपके लिए एक गाना",
      headline: (to: string, from: string) => `${to}, ${from} ने आपके लिए गाना बनाया है`,
      open: "अपना तोहफ़ा खोलें",
      sound: "आवाज़ के साथ चलता है",
      madeWithAi: "AI से बना",
      from: (from: string) => `${from} की ओर से`,
      wrote: (from: string) => `${from} ने लिखा:`,
      lyrics: "गाने के बोल",
      follow: "साथ चलें",
      reply: "अपने गाने से जवाब दें",
      replyFree: "पहला जवाब मुफ़्त · करीब एक मिनट",
      privacy: (from: string) => `${from} देख सकते हैं कि यह खुला और कितनी बार चला। बस इतना ही।`,
      report: "शिकायत करें",
      terms: "नियम",
      play: "चलाएँ",
      pause: "रोकें",
      ownVoice: (from: string) => `${from} की अपनी आवाज़ में`,
      processing: "आपका गाना लगभग तैयार है",
      processingSub: (from: string) => `${from} का गाना बन रहा है। यह पेज खुद दोबारा देखेगा।`,
      stillMaking: "अभी बन रहा है। कुछ मिनट बाद आइए।",
      failed: "यह गाना नहीं बन पाया।",
      removed: "यह तोहफ़ा अब उपलब्ध नहीं है। भेजने वाले ने इसे शेयर करना बंद कर दिया।",
      takenDown: "शिकायत के बाद यह तोहफ़ा हटा दिया गया।",
      makeOwn: "अपना गाना बनाएँ",
      audioFailed: "गाना लोड नहीं हुआ। इंटरनेट देखें और फिर से कोशिश करें।",
      tryAgain: "फिर से कोशिश करें",
      replyTo: (o: string) => `आपके ${o} वाले गाने का जवाब`,
      instrumental: "आपके लिए बनी एक धुन",
      reportTitle: "इस तोहफ़े की शिकायत करें",
      reasons: { voice_or_likeness: "इसमें बिना इजाज़त मेरी आवाज़ या चेहरा है", copyright: "कॉपीराइट", hateful: "नफ़रत या गाली-गलौज", minor_sexual: "नाबालिग से जुड़ी यौन सामग्री", other: "कुछ और" },
      details: "जानकारी (चाहें तो)",
      email: "जवाब के लिए ईमेल (चाहें तो)",
      sendReport: "शिकायत भेजें",
      reportThanks: "शुक्रिया। हम 24 घंटे में देखेंगे।",
      close: "बंद करें",
    };
  if (lang === "ar")
    return {
      overline: her ? "أغنية لكِ" : "أغنية لك",
      headline: (to: string, from: string) => `${to}، هذه أغنية من ${from} ${her ? "لكِ" : "لك"}`,
      open: her ? "افتحي هديتك" : him ? "افتح هديتك" : "فتح الهدية",
      sound: "تعمل مع الصوت",
      madeWithAi: "صُنع بالذكاء الاصطناعي",
      from: (from: string) => `من ${from}`,
      wrote: (from: string) => `رسالة ${from}:`,
      lyrics: "كلمات الأغنية",
      follow: "متابعة الكلمات",
      reply: her ? "ردّي بأغنيتك" : him ? "ردّ بأغنيتك" : "الرد بأغنية",
      replyFree: "أول رد مجاني · نحو دقيقة",
      privacy: (from: string) => `يرى ${from} أنها فُتحت وكم مرة شُغّلت. لا شيء غير ذلك.`,
      report: "إبلاغ",
      terms: "الشروط",
      play: "تشغيل",
      pause: "إيقاف مؤقت",
      ownVoice: (from: string) => `بصوت ${from} الحقيقي`,
      processing: "أغنيتك شبه جاهزة",
      processingSub: (from: string) => `أغنية ${from} قيد الإنشاء. ستتحقق هذه الصفحة تلقائيًا.`,
      stillMaking: "ما زالت قيد الإنشاء. يمكن العودة بعد دقائق.",
      failed: "تعذّر إنشاء هذه الأغنية.",
      removed: "هذه الهدية لم تعد متاحة. أوقف المرسل مشاركتها.",
      takenDown: "أُزيلت هذه الهدية بعد بلاغ.",
      makeOwn: "إنشاء أغنيتك",
      audioFailed: "لم يتم تحميل الأغنية. يُرجى التحقق من الإنترنت وإعادة المحاولة.",
      tryAgain: "إعادة المحاولة",
      replyTo: (o: string) => `ردّ على أغنية ${o}`,
      instrumental: "لحن صُنع لأجلك",
      reportTitle: "الإبلاغ عن هذه الهدية",
      reasons: { voice_or_likeness: "تستخدم صوتي أو صورتي دون إذن", copyright: "حقوق النشر", hateful: "كراهية أو إساءة", minor_sexual: "محتوى جنسي يخص قاصرًا", other: "شيء آخر" },
      details: "تفاصيل (اختياري)",
      email: "بريد للرد (اختياري)",
      sendReport: "إرسال البلاغ",
      reportThanks: "شكرًا. سنراجعه خلال 24 ساعة.",
      close: "إغلاق",
    };
  return {
    overline: "A song for you",
    headline: (to: string, from: string) => `${to}, ${from} made you a song`,
    open: "Open your gift",
    sound: "Plays with sound",
    madeWithAi: "Made with AI",
    from: (from: string) => `From ${from}`,
    wrote: (from: string) => `${from} wrote:`,
    lyrics: "Lyrics",
    follow: "Follow along",
    reply: "Reply with your own song",
    replyFree: "Your first reply is free · takes about a minute",
    privacy: (from: string) => `${from} sees that this was opened and how often it played. Nothing else.`,
    report: "Report",
    terms: "Terms",
    play: "Play",
    pause: "Pause",
    ownVoice: (from: string) => `Sung in ${from}'s own voice`,
    processing: "Your song is almost ready",
    processingSub: (from: string) => `${from}'s song is being made. This page checks again by itself.`,
    stillMaking: "Still making it. Come back in a few minutes.",
    failed: "This song couldn't be made.",
    removed: "This gift isn't available any more. The person who sent it stopped sharing it.",
    takenDown: "This gift was removed after a report.",
    makeOwn: "Make your own song",
    audioFailed: "The song didn't load. Check your internet and try again.",
    tryAgain: "Try again",
    replyTo: (o: string) => `A reply to your ${o} song`,
    instrumental: "A tune made for you",
    reportTitle: "Report this gift",
    reasons: { voice_or_likeness: "It uses my voice or likeness without consent", copyright: "Copyright", hateful: "Hateful or abusive", minor_sexual: "Sexual content involving a minor", other: "Something else" },
    details: "Details (optional)",
    email: "Email for a reply (optional)",
    sendReport: "Send report",
    reportThanks: "Thanks. We'll review it within 24 hours.",
    close: "Close",
  };
}

export type PageCopy = ReturnType<typeof copy>;

// The link preview's title and text (WhatsApp shows these under the picture). The note stays out,
// so it's still a surprise.
export function previewText(lang: PageLang, v: { toName: string; fromName: string; occasion: Occasion }, address: Address) {
  const o = occasionName(lang, v.occasion);
  if (lang === "hi") return { title: `${v.toName} के लिए ${o} का गाना`, description: `${v.fromName} की ओर से · खोलने के लिए टैप करें · AI से बना` };
  if (lang === "ar") return { title: `أغنية ${o} إلى ${v.toName}`, description: `من ${v.fromName} · ${address === "her" ? "اضغطي" : address === "him" ? "اضغط" : "الضغط"} للفتح · صُنع بالذكاء الاصطناعي` };
  return { title: v.occasion === "just_because" ? `A song for ${v.toName}` : `${cap(o)} song for ${v.toName}`, description: `From ${v.fromName} · Tap to open · Made with AI` };
}
