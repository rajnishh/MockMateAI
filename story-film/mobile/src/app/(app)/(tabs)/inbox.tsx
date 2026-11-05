import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { View } from "react-native";

import { Banner, Button, Card, Empty, Header, ListRow, Row, Screen, Skeleton, Txt } from "@/components/ui";
import { api, type ReceivedReply, type SentGift } from "@/lib/api";
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

// Inbox: "Gifts and duets" for now (gifts sent and songs sent back); comments come later.
export default function Inbox() {
  const gifts = useData(() => api.gifts());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
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
      <Header title="Inbox" sub="Gifts and duets" />
      {gifts.error ? <Banner kind="error" text={gifts.error} action={<Button label="Retry" small kind="secondary" onPress={gifts.reload} />} /> : null}
      {error ? <Banner kind="error" text={error} /> : null}
      {!gifts.data && !gifts.error ? <Skeleton height={120} /> : null}
      {replies.map((r) => (
        <ReplyCard key={r.id} reply={r} />
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
      <Card flat>
        <ListRow icon="inbox" title="Comments and DMs together" sub="Coming in the next beta" />
      </Card>
    </Screen>
  );
}

function ReplyCard({ reply }: { reply: ReceivedReply }) {
  return (
    <Card>
      <ListRow icon="music" title={`${reply.fromName} sent you a song back`} sub={`${reply.songTitle} · ${occasionLabel(reply.occasion)} · ${ago(reply.createdAt)}`} />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Button label={reply.songReady ? "Play reply" : "Still being made"} icon="play" small disabled={!reply.songReady} onPress={() => WebBrowser.openBrowserAsync(reply.url).catch(() => undefined)} />
        <Button label="Reply again" icon="mic" small kind="secondary" onPress={() => replyTo(reply.token, reply.fromName, reply.occasion)} />
      </View>
    </Card>
  );
}
