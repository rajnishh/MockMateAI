import { useEffect, useState } from "react";
import { Linking, View } from "react-native";

import { Button, Card, Screen, Txt } from "@/components/ui";
import { PRIVACY_URL } from "@/lib/config";
import { getItem, setItem } from "@/lib/storage";

// App Store guideline 5.1.2(i): before anything personal goes to a third-party AI, say so and ask.
// Asked once per account on each phone, right after sign-in and before onboarding makes a first reel.
const key = (userId: string) => `reelkar.aiConsent.${userId.replace(/[^A-Za-z0-9._-]/g, "_")}`;

export function useAiConsent(userId: string | null): { known: boolean; given: boolean; accept: () => Promise<void> } {
  const [state, setState] = useState<{ for: string | null; given: boolean } | null>(null);
  useEffect(() => {
    if (!userId) return;
    let live = true;
    getItem(key(userId)).then(
      (v) => live && setState({ for: userId, given: v === "1" }),
      () => live && setState({ for: userId, given: false }),
    );
    return () => {
      live = false;
    };
  }, [userId]);
  const known = !userId || state?.for === userId;
  return {
    known,
    given: !userId || (known && Boolean(state?.given)),
    accept: async () => {
      if (!userId) return;
      await setItem(key(userId), "1");
      setState({ for: userId, given: true });
    },
  };
}

const SENT = [
  ["What you type", "topics, scripts and lyrics"],
  ["Photos and videos you pick", "to put you or your characters in a reel"],
  ["Your voice", "when you hum, sing or speak to make a song"],
] as const;

export function AiConsent({ onAccept, onDecline }: { onAccept: () => Promise<void>; onDecline: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Screen
      footer={
        <>
          <Button
            label="Allow and continue"
            block
            loading={busy}
            onPress={async () => {
              setBusy(true);
              await onAccept().finally(() => setBusy(false));
            }}
          />
          <Button label="Not now, sign out" kind="ghost" block onPress={onDecline} />
        </>
      }>
      <View style={{ paddingTop: 24, gap: 16 }}>
        <Txt variant="xl">Reelkar makes things with AI</Txt>
        <Txt variant="body" color="inkMuted">
          To make your reels and songs, we send what&apos;s needed for each step to AI services that work for us: fal.ai, Runware,
          Cloudflare, Google Gemini, Anthropic, OpenRouter, Groq and Sarvam AI.
        </Txt>
        <Card>
          {SENT.map(([title, sub]) => (
            <View key={title} style={{ gap: 2, paddingVertical: 6 }}>
              <Txt variant="label">{title}</Txt>
              <Txt variant="cap">{sub}</Txt>
            </View>
          ))}
        </Card>
        <Txt variant="body" color="inkMuted">
          They may only use it to make what you asked for. We never sell your data or use it for ads. Everything stays private
          unless you publish it.
        </Txt>
        <Button label="Read the privacy policy" kind="ghost" onPress={() => Linking.openURL(PRIVACY_URL).catch(() => undefined)} style={{ alignSelf: "flex-start" }} />
      </View>
    </Screen>
  );
}
