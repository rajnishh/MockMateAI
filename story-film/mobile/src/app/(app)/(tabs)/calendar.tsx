import { router } from "expo-router";
import { useState } from "react";
import { Linking, View } from "react-native";

import { PlatformTile } from "@/components/platform-tile";
import { Banner, Button, Card, Empty, Header, Row, Screen, Skeleton, Status, Txt } from "@/components/ui";
import { api, type Post } from "@/lib/api";
import { useData } from "@/lib/use-data";

const DAY = 86400_000;

function dayKey(d: Date) {
  return d.toDateString();
}

function dayLabel(d: Date, today: Date) {
  const diff = Math.round((new Date(d.toDateString()).getTime() - new Date(today.toDateString()).getTime()) / DAY);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

function statusOf(p: Post) {
  switch (p.status) {
    case "published":
      return <Status kind="ok" text="Posted" />;
    case "failed":
      return <Status kind="error" text="Failed" />;
    case "publishing":
      return <Status kind="making" text="Posting" />;
    default:
      return <Status kind="warn" text="Scheduled" />;
  }
}

export default function Calendar() {
  const [today] = useState(() => new Date());
  const posts = useData(() => api.posts(new Date(today.getTime() - 2 * DAY), new Date(today.getTime() + 30 * DAY)));
  const accounts = useData(() => api.accounts());
  const [busy, setBusy] = useState<string | null>(null);

  async function act(id: string, fn: () => Promise<unknown>) {
    setBusy(id);
    try {
      await fn();
      await posts.reload();
    } finally {
      setBusy(null);
    }
  }

  const list = (posts.data ?? []).filter((p) => p.status !== "cancelled");
  const days = new Map<string, Post[]>();
  for (const p of list) {
    const k = dayKey(new Date(p.scheduledAt));
    days.set(k, [...(days.get(k) ?? []), p]);
  }
  const noAccounts = accounts.data && accounts.data.accounts.length === 0;

  return (
    <Screen>
      <Header title="Calendar" right={<Button label="Accounts" small kind="ghost" icon="link" onPress={() => router.push("/connections")} />} />
      {posts.error ? <Banner kind="error" text={posts.error} action={<Button label="Retry" small kind="secondary" onPress={posts.reload} />} /> : null}
      {noAccounts ? (
        <Banner kind="info" title="Connect where you post" text="Connect Instagram or YouTube, then post or schedule any finished reel." action={<Button label="Connect" small onPress={() => router.push("/connections")} />} />
      ) : null}
      {posts.loading && !posts.data ? (
        <Skeleton height={200} />
      ) : list.length === 0 ? (
        <Empty
          title="Nothing scheduled yet"
          text="Open a finished reel and choose Post now or a time. Scheduled posts show up here."
          action={<Button label="Open my reels" icon="film" onPress={() => router.push("/reels")} />}
        />
      ) : (
        [...days.entries()].map(([k, dayPosts]) => (
          <View key={k} style={{ gap: 8 }}>
            <Txt variant="over">{dayLabel(new Date(k), today)}</Txt>
            {dayPosts.map((p) => (
              <Card key={p.id} flat>
                <Row style={{ gap: 12, flexWrap: "nowrap" }}>
                  <Txt variant="mono">{new Date(p.scheduledAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</Txt>
                  <PlatformTile platform={p.platform} />
                  <View style={{ flex: 1 }}>
                    <Txt variant="label" numberOfLines={2}>
                      {p.title}
                    </Txt>
                    <Txt variant="cap">{p.accountName ?? ""}</Txt>
                  </View>
                </Row>
                <Row style={{ justifyContent: "space-between" }}>
                  {statusOf(p)}
                  {p.status === "scheduled" ? (
                    <Button label="Cancel" small kind="ghost" loading={busy === p.id} onPress={() => act(p.id, () => api.cancelPost(p.id))} />
                  ) : p.status === "failed" ? (
                    <Button label="Try again" small kind="secondary" icon="refresh" loading={busy === p.id} onPress={() => act(p.id, () => api.retryPost(p.id))} />
                  ) : p.status === "published" && p.externalUrl ? (
                    <Button label="Open" small kind="ghost" onPress={() => Linking.openURL(p.externalUrl!).catch(() => undefined)} />
                  ) : null}
                </Row>
                {p.error ? <Txt variant="cap" color="danger">{p.error}</Txt> : null}
              </Card>
            ))}
          </View>
        ))
      )}
    </Screen>
  );
}
