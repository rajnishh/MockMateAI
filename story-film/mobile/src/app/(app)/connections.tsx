import { useState } from "react";

import { PlatformTile } from "@/components/platform-tile";
import { Banner, Button, Card, Header, ListRow, Row, Screen, Skeleton, Txt } from "@/components/ui";
import { api, type SocialPlatform } from "@/lib/api";
import { connectAccount, PLATFORM_LABEL } from "@/lib/connect";
import { useData } from "@/lib/use-data";

const PLATFORMS: { platform: SocialPlatform; note: string }[] = [
  { platform: "instagram", note: "Needs a Creator or Business account (free to switch in Instagram settings)" },
  { platform: "youtube", note: "Posts as YouTube Shorts on your channel" },
];

export default function Connections() {
  const data = useData(() => api.accounts());
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "info" | "error"; text: string } | null>(null);

  async function connect(platform: SocialPlatform) {
    setBusy(platform);
    setMessage(null);
    try {
      if (await connectAccount(platform)) setMessage({ kind: "info", text: `${PLATFORM_LABEL[platform]} connected` });
      await data.reload();
    } catch (err) {
      setMessage({ kind: "error", text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function disconnect(id: string) {
    setBusy(id);
    try {
      await api.disconnect(id);
      await data.reload();
    } finally {
      setBusy(null);
    }
  }

  const d = data.data;
  return (
    <Screen>
      <Header title="Connected accounts" back />
      <Txt color="inkMuted">Connect where you post. Reelkar only posts what you approve or schedule.</Txt>
      {message ? <Banner kind={message.kind} text={message.text} /> : null}
      {data.error ? <Banner kind="error" text={data.error} /> : null}
      {!d ? (
        <Skeleton height={160} />
      ) : (
        PLATFORMS.map(({ platform, note }) => {
          const available = platform === "instagram" ? d.instagramAvailable : d.youtubeAvailable;
          const accounts = d.accounts.filter((a) => a.platform === platform);
          return (
            <Card key={platform}>
              <Row style={{ gap: 12 }}>
                <PlatformTile platform={platform} size={36} />
                <Txt variant="md" style={{ flex: 1 }}>
                  {PLATFORM_LABEL[platform]}
                </Txt>
                {available ? (
                  <Button label={accounts.length ? "Add another" : "Connect"} small kind={accounts.length ? "ghost" : "primary"} loading={busy === platform} onPress={() => connect(platform)} />
                ) : (
                  <Txt variant="cap">Coming soon</Txt>
                )}
              </Row>
              <Txt variant="cap">{note}</Txt>
              {accounts.map((a) => (
                <ListRow
                  key={a.id}
                  title={a.name}
                  sub={a.needsReconnect ? "Access expired: connect again" : "Connected"}
                  right={<Button label="Remove" small kind="ghost" loading={busy === a.id} onPress={() => disconnect(a.id)} />}
                />
              ))}
            </Card>
          );
        })
      )}
    </Screen>
  );
}
