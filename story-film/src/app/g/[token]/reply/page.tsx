import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { OCCASION_LABEL, replyTarget } from "@/lib/gifts";
import { getUserId } from "@/lib/session";
import { SONG_CREDITS } from "@/lib/billing/catalog";
import { pickLang } from "../copy";
import s from "../gift.module.css";
import { ReplyForm } from "./reply-form";

// "Reply with your own song": sign in (one screen), then straight into a song for the sender with
// the occasion filled in. The reply is a gift back to them, and the first one is free.
export default async function ReplyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const userId = await getUserId();
  if (!userId) redirect(`/login?next=${encodeURIComponent(`/g/${token}/reply`)}`);
  const target = await replyTarget(getDb(), userId, token);
  const lang = pickLang((await headers()).get("accept-language"));
  // Prefilled with the account's name, unless it's a placeholder ("Creator 1234", or none).
  const [me] = await getDb().select({ name: user.name }).from(user).where(eq(user.id, userId));
  const myName = me && !/^Creator \d{4}$/.test(me.name.trim()) ? me.name.trim() : "";
  if ("error" in target) {
    return (
      <div className={s.page}>
        <main className={s.main} style={{ paddingTop: 32 }}>
          <section className={`${s.hero} ${s.center}`}>
            <p className={s.headline}>{target.error}</p>
            <a className={s.ghostBtn} href={`/g/${token}`}>
              Back to the gift
            </a>
          </section>
        </main>
      </div>
    );
  }
  return (
    <ReplyForm
      token={token}
      to={target.senderName}
      occasion={OCCASION_LABEL[target.original.occasion]}
      free={target.free}
      myName={myName}
      price={SONG_CREDITS}
      language={lang === "en" ? "hinglish" : lang}
    />
  );
}
