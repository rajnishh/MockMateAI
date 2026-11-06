import { router, useFocusEffect } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useState } from "react";
import { View } from "react-native";

import { SafetyActions } from "@/components/safety-actions";
import { Banner, Button, Card, Empty, Header, ListRow, Row, Screen, Skeleton, Txt } from "@/components/ui";
import { api, type Duet, type ReceivedReply, type RemixInboxItem, type SentGift } from "@/lib/api";
import { KIND_NOUN, plusAmount } from "@/lib/remixes";
import { hoursLeft } from "@/lib/duets";
import { markInboxSeen } from "@/lib/inbox-unread";
import { giftMessage, occasionLabel, replyContext, sendOnWhatsApp } from "@/lib/gifts";
import { useData } from "@/lib/use-data";

function ago(iso: string | null): string {
  if (!iso) return "";
  const min = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}

// What the sender sees: opened or not, plays and when. Never who opened it; the name is the one
// they typed, and a link can be forwarded (design decision 4).
function statusLine(g: SentGift): string {
  if (g.takenDown) return "Removed after a report";
  if (!g.sharing) return "Not shared any more";
  if (!g.opened) return `Sent to ${g.toName} · not opened yet`;
  const plays = g.playCount === 1 ? "1 play" : `${g.playCount} plays`;
  return `Opened · ${plays}${g.lastPlayedAt ? ` · last ${ago(g.lastPlayedAt)}` : ""}`;
}

function replyTo(token: string, toName: string, occasion: SentGift["occasion"]) {
  replyContext.set({ token, toName, occasion });
  router.push("/hum");
}

// One line on where a Jugalbandi is, for whoever is looking.
function duetLine(d: Duet): string {
  const other = (d.role === "a" ? d.partnerName : d.starterName) || "your friend";
  const mine = d.role === "a" ? d.partA : d.partB;
  switch (d.phase) {
    case "recording_a":
      return d.role === "a" ? "Record your part" : `${d.starterName} is singing their part`;
    case "waiting":
      return !mine ? "Your turn to sing" : `Waiting for ${other} · ${hoursLeft(d.expiresAt)} left`;
    case "expired":
      return `${other} didn't answer · choose what's next`;
    case "declined":
      return `${other} can't join this time`;
    case "joining":
      return "Joining your parts…";
    case "join_failed":
      return "That didn't work · try again";
    case "ready":
      return d.approvedA && d.approvedB ? "You both approved · post it" : (d.role === "a" ? d.approvedA : d.approvedB) ? `Waiting for ${other} to approve` : "Ready · listen and approve";
    case "solo":
      return "Finished solo";
    default:
      return "Cancelled";
  }
}

// A remix of one of your songs (design/community/remix-spec.md X11): named once it's public,
// "Someone" while it's private, batched when a song got more than 3 in a day. No "0" when it earned nothing.
function remixRow(r: RemixInboxItem): { title: string; sub: string; open: () => void } {
  const amount = r.hundredths > 0 ? plusAmount(r.hundredths) : null;
  const earnings = () => router.push({ pathname: "/earn/[ref]", params: { ref: r.subjectRef } });
  if (r.kind === "batch") return { title: `${r.count} new remixes of ${r.songTitle}`, sub: [ago(r.at), amount && `${amount} credit`].filter(Boolean).join(" · "), open: earnings };
  const noun = KIND_NOUN[r.remixKind ?? "cover"] ?? "remix";
  const sub = [ago(r.at), amount && `${amount} credit`].filter(Boolean).join(" · ");
  if (r.kind === "published") return { title: `@${r.remixerHandle} published a ${noun} of ${r.songTitle}`, sub, open: () => router.push({ pathname: "/s/[id]", params: { id: r.publicId! } }) };
  return { title: `Someone made a ${noun} of ${r.songTitle}`, sub, open: earnings };
}

// Inbox: "Gifts and duets" (gifts, songs sent back and Jugalbandis) and Remixes of your songs; comments come later.
export default function Inbox() {
  const gifts = useData(() => api.gifts());
  const duets = useData(() => api.duets());
  const remixes = useData(() => api.remixInbox());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Opening Inbox clears the "new" dot on the Home bell and the You tab.
  useFocusEffect(
    useCallback(() => {
      markInboxSeen().catch(() => undefined);
    }, []),
  );
  const sent = gifts.data?.sent ?? [];
  const replies = gifts.data?.replies ?? [];

  async function setSharing(g: SentGift, sharing: boolean) {
    setBusy(g.id);
    setError(null);
    try {
      await api.setGiftSharing(g.id, sharing);
      await gifts.reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen>
      <Header title="Inbox" sub="Gifts, duets and remixes" back />
      {gifts.error ? <Banner kind="error" text={gifts.error} action={<Button label="Retry" small kind="secondary" onPress={gifts.reload} />} /> : null}
      {error ? <Banner kind="error" text={error} /> : null}
      {!gifts.data && !gifts.error ? <Skeleton height={120} /> : null}
      {(duets.data ?? []).map((d) => (
        <Card key={d.id} onPress={() => router.push(`/duets/${d.id}`)}>
          <ListRow icon="mic" title={`Jugalbandi${(d.role === "a" ? d.partnerName : d.starterName) ? ` with ${d.role === "a" ? d.partnerName : d.starterName}` : ""}`} sub={`${d.topic} · ${duetLine(d)}`} />
        </Card>
      ))}
      <Button label="Start a Jugalbandi" icon="mic" kind="secondary" block onPress={() => router.push("/duets/new")} />
      {replies.map((r) => (
        <ReplyCard key={r.id} reply={r} onBlocked={gifts.reload} />
      ))}
      {sent.map((g) => (
        <Card key={g.id}>
          <ListRow icon="gift" title={`${occasionLabel(g.occasion)} song for ${g.toName}`} sub={statusLine(g)} />
          {g.replies > 0 ? <Txt variant="label">{g.replies === 1 ? "1 song came back" : `${g.replies} songs came back`}</Txt> : null}
          <Row style={{ gap: 8, flexWrap: "wrap" }}>
            {g.takenDown ? null : g.sharing ? (
              <>
                <Button label={g.opened ? "Open" : "Send again"} icon={g.opened ? "play" : "send"} small kind="secondary" onPress={() => (g.opened ? WebBrowser.openBrowserAsync(`${g.url}?preview=1`) : sendOnWhatsApp(giftMessage(g.toName, g.occasion, g.url))).catch(() => undefined)} />
                <Button label="Stop sharing" small kind="ghost" loading={busy === g.id} onPress={() => setSharing(g, false)} />
              </>
            ) : (
              <Button label="Share again" icon="refresh" small kind="secondary" loading={busy === g.id} onPress={() => setSharing(g, true)} />
            )}
          </Row>
        </Card>
      ))}
      {gifts.data && !sent.length && !replies.length ? (
        <Empty title="No gifts yet" text="Make a song for someone's birthday, wedding or Eid, then tap Make it a gift. It opens on WhatsApp, no app needed." action={<Button label="Make a song" icon="music" kind="secondary" onPress={() => router.push("/hum")} />} />
      ) : null}
      {remixes.data?.length ? (
        <>
          <Txt variant="md" accessibilityRole="header">
            Remixes
          </Txt>
          {remixes.data.map((r) => {
            const row = remixRow(r);
            return (
              <Card key={`${r.kind}-${r.subjectRef}-${r.at}`} onPress={row.open}>
                <ListRow icon={r.kind === "published" ? "music" : "earn"} title={row.title} sub={row.sub} />
              </Card>
            );
          })}
        </>
      ) : null}
      <Card flat>
        <ListRow icon="inbox" title="Comments and DMs together" sub="Coming in the next beta" />
      </Card>
    </Screen>
  );
}

// A song sent back to me, with Report and Block for its sender (their later songs then don't reach me).
function ReplyCard({ reply, onBlocked }: { reply: ReceivedReply; onBlocked: () => void }) {
  return (
    <Card>
      <ListRow icon="music" title={`${reply.fromName} sent you a song back`} sub={`${reply.songTitle} · ${occasionLabel(reply.occasion)} · ${ago(reply.createdAt)}`} />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Button label={reply.songReady ? "Play reply" : "Still being made"} icon="play" small disabled={!reply.songReady} onPress={() => WebBrowser.openBrowserAsync(reply.url).catch(() => undefined)} />
        <Button label="Reply again" icon="mic" small kind="secondary" onPress={() => replyTo(reply.token, reply.fromName, reply.occasion)} />
      </View>
      <SafetyActions report={{ kind: "gift", id: reply.token, label: "Report this song" }} block={{ target: { gift: reply.token }, name: reply.fromName }} onBlockChange={(on) => (on ? onBlocked() : undefined)} />
    </Card>
  );
}
