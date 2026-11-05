import type { PageLang } from "@/app/g/[token]/copy";
import type { Reaction } from "@/lib/listen";

// The public song page's own words; the Report dialog's come from the gift page's copy.
export const REACTION_EMOJI: Record<Reaction, string> = { fire: "🔥", dance: "💃", touched: "🥹", haha: "😂", respect: "🙏", celebrate: "🎉" };

export function songCopy(lang: PageLang) {
  if (lang === "hi")
    return {
      plays: (n: number) => `${n.toLocaleString("en-IN")} बार सुना गया`,
      likes: (n: number) => `${n.toLocaleString("en-IN")} पसंद`,
      play: "चलाएँ",
      pause: "रोकें",
      like: "पसंद",
      notForMe: "मेरे लिए नहीं",
      lyrics: "गाने के बोल",
      more: "ऐसे और गाने",
      byCreator: (h: string) => `@${h} के और गाने`,
      makeOwn: "अपना गाना बनाएँ",
      share: "शेयर करें",
      copied: "लिंक कॉपी हो गया",
      next: (sec: number) => `अगला गाना ${sec} सेकंड में`,
      cancel: "रद्द करें",
      private: "यह गाना अब निजी है।",
      takenDown: "शिकायत के बाद यह गाना हटा दिया गया।",
      reportTitle: "इस गाने की शिकायत करें",
      ownVoice: (h: string) => `@${h} की अपनी आवाज़ में`,
      remixOf: (title: string, h: string) => `“${title}” (@${h}) का रीमिक्स`,
      signInToReact: "पसंद या रिएक्ट करने के लिए साइन इन करें",
      yours: "आपका गाना",
    };
  if (lang === "ar")
    return {
      plays: (n: number) => `${n.toLocaleString("ar")} استماع`,
      likes: (n: number) => `${n.toLocaleString("ar")} إعجاب`,
      play: "تشغيل",
      pause: "إيقاف مؤقت",
      like: "أعجبني",
      notForMe: "ليست لي",
      lyrics: "الكلمات",
      more: "أغانٍ مشابهة",
      byCreator: (h: string) => `المزيد من @${h}`,
      makeOwn: "اصنع أغنيتك",
      share: "مشاركة",
      copied: "تم نسخ الرابط",
      next: (sec: number) => `الأغنية التالية بعد ${sec} ث`,
      cancel: "إلغاء",
      private: "أصبحت هذه الأغنية خاصة.",
      takenDown: "أُزيلت هذه الأغنية بعد بلاغ.",
      reportTitle: "الإبلاغ عن هذه الأغنية",
      ownVoice: (h: string) => `بصوت @${h} نفسه`,
      remixOf: (title: string, h: string) => `ريمكس لأغنية «${title}» من @${h}`,
      signInToReact: "سجّل الدخول لتُعجب أو تتفاعل",
      yours: "أغنيتك",
    };
  return {
    plays: (n: number) => `${n.toLocaleString("en-IN")} ${n === 1 ? "play" : "plays"}`,
    likes: (n: number) => `${n.toLocaleString("en-IN")} ${n === 1 ? "like" : "likes"}`,
    play: "Play",
    pause: "Pause",
    like: "Like",
    notForMe: "Not for me",
    lyrics: "Lyrics",
    more: "More like this",
    byCreator: (h: string) => `More by @${h}`,
    makeOwn: "Make your own song",
    share: "Share",
    copied: "Link copied",
    next: (sec: number) => `Next song in ${sec} s`,
    cancel: "Cancel",
    private: "This song is private now.",
    takenDown: "This song was removed after a report.",
    reportTitle: "Report this song",
    ownVoice: (h: string) => `Sung in @${h}'s own voice`,
    remixOf: (title: string, h: string) => `A remix of “${title}” by @${h}`,
    signInToReact: "Sign in to like or react",
    yours: "Your song",
  };
}
