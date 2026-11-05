import { useEffect, useState } from "react";
import { View } from "react-native";

import { Button, Card, Row, Txt } from "@/components/ui";
import { dismissPushOffer, registerForPush, shouldOfferPush } from "@/lib/push";

// Shown once, under a song or reel that just got made: the moment a creator knows it takes a
// while and would like to hear when the next one is ready. Tapping Turn on shows iOS's prompt.
export function PushOffer({ what }: { what: "song" | "reel" }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    shouldOfferPush().then(setShow, () => undefined);
  }, []);

  if (!show) return null;
  const close = () => setShow(false);
  return (
    <Card>
      <View style={{ gap: 4 }}>
        <Txt variant="md">Tell me when it&apos;s ready</Txt>
        <Txt variant="cap">
          {what === "song" ? "Songs take a minute or two." : "Reels take a few minutes."} Get a notification when your next one is ready, so you can
          leave the app while it&apos;s made.
        </Txt>
      </View>
      <Row>
        <Button label="Turn on" icon="bell" small onPress={() => dismissPushOffer().then(() => registerForPush(true)).catch(() => false).finally(close)} />
        <Button label="Not now" kind="ghost" small onPress={() => dismissPushOffer().finally(close)} />
      </Row>
    </Card>
  );
}
