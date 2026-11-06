import { router } from "expo-router";
import type { ReactNode } from "react";
import { Linking, Pressable, View } from "react-native";

import { Card, Credits, Header, ListRow, Row, Screen, Txt } from "@/components/ui";
import { api } from "@/lib/api";
import { PRIVACY_URL, SUPPORT_EMAIL } from "@/lib/config";
import { useInboxUnread } from "@/lib/inbox-unread";
import { useSession } from "@/lib/session";
import { useData } from "@/lib/use-data";
import { fonts, useTheme } from "@/theme";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Txt variant="md" accessibilityRole="header">
        {title}
      </Txt>
      <Card>{children}</Card>
    </View>
  );
}

// You tab (design/v3.0/navigation.md §5): your reels, calendar, inbox and money; settings stay at /account.
export default function You() {
  const { colors } = useTheme();
  const { user, prefs } = useSession();
  const billing = useData(() => api.billing());
  const unread = useInboxUnread();
  const name = user?.name ?? "Creator";
  const handle = prefs?.brand?.handle;
  const balance = billing.data?.balance;

  return (
    <Screen>
      <Header title="You" />
      <Card>
        <Row style={{ flexWrap: "nowrap", alignItems: "center" }}>
          <View style={{ width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: colors.brand }}>
            <Txt style={{ fontFamily: fonts.extrabold, fontSize: 20, color: colors.onBrand }}>{name.slice(0, 1).toUpperCase()}</Txt>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Txt variant="label" numberOfLines={1}>
              {name}
            </Txt>
            {handle ? (
              <Txt variant="cap">{handle}</Txt>
            ) : (
              <Pressable accessibilityRole="link" hitSlop={12} onPress={() => router.push("/account")}>
                <Txt variant="cap" style={{ color: colors.tealText }}>
                  Pick your handle
                </Txt>
              </Pressable>
            )}
          </View>
          <Credits count={balance ?? null} />
        </Row>
      </Card>

      <Section title="My stuff">
        <ListRow icon="film" title="My reels" sub="Every reel you've made" onPress={() => router.push("/reels")} />
        <ListRow icon="calendar" title="Posting calendar" sub="What's going out and when" onPress={() => router.push("/calendar")} />
        <ListRow
          icon="inbox"
          title={unread ? `Inbox · ${unread} new` : "Inbox"}
          sub="Duets, gifts and remixes of your songs"
          onPress={() => router.push("/inbox")}
        />
      </Section>

      <Section title="Money">
        <ListRow icon="sparkle" title="Credits and plans" sub={balance === undefined ? undefined : `${balance} credits left`} onPress={() => router.push("/credits")} />
        <ListRow icon="earn" title="Earnings" sub="From remixes of your songs and uses of your recipes" onPress={() => router.push("/earn")} />
      </Section>

      <Section title="Settings">
        <ListRow icon="link" title="Connected accounts" sub="Instagram, YouTube" onPress={() => router.push("/connections")} />
        <ListRow icon="user" title="Settings" sub="Language, your reel look, notifications" onPress={() => router.push("/account")} />
        {SUPPORT_EMAIL ? (
          <ListRow
            icon="send"
            title="Send feedback"
            sub="Tell us what to fix"
            onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=Reelkar%20beta%20feedback`).catch(() => undefined)}
          />
        ) : null}
        {PRIVACY_URL ? <ListRow icon="lock" title="Privacy policy" onPress={() => Linking.openURL(PRIVACY_URL).catch(() => undefined)} /> : null}
      </Section>
    </Screen>
  );
}
