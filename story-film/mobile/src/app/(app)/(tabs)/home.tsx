import { router } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { Icon } from "@/components/icon";

import { ReelGrid } from "@/components/reel-grid";
import { Banner, Button, Card, CheckRow, Credits, Empty, Hero, ProgressBar, Row, Screen, Skeleton, Txt, Win } from "@/components/ui";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { useData } from "@/lib/use-data";
import { useTheme } from "@/theme";

const WEEK = 7 * 86400000;

export default function Home() {
  const { user } = useSession();
  const { colors } = useTheme();
  const films = useData(() => api.films());
  const billing = useData(() => api.billing());

  // Captured once per visit so filtering stays pure during render.
  const [now] = useState(() => Date.now());
  const list = films.data ?? [];
  const thisWeek = list.filter((f) => now - new Date(f.createdAt).getTime() < WEEK);
  const ready = list.filter((f) => f.status === "completed");
  const making = list.find((f) => f.status === "queued" || f.status === "running");
  const goal = 5;

  return (
    <Screen>
      <Row style={{ justifyContent: "space-between" }}>
        <View>
          <Txt variant="cap">Namaste, {user?.name?.split(" ")[0] ?? "creator"}</Txt>
          <Txt variant="lg" accessibilityRole="header">
            Today
          </Txt>
        </View>
        <Row>
          <Credits count={billing.data?.balance ?? null} />
          <Pressable accessibilityRole="button" accessibilityLabel="Account" hitSlop={8} onPress={() => router.push("/account")}>
            <Icon name="user" color={colors.ink} />
          </Pressable>
        </Row>
      </Row>

      {films.error ? <Banner kind="error" title="Couldn't load your reels" text="Check your internet connection." action={<Button label="Retry" small kind="secondary" onPress={films.reload} />} /> : null}

      {films.loading && !films.data ? (
        <>
          <Skeleton height={140} />
          <Skeleton />
        </>
      ) : (
        <>
          <Hero>
            <Txt variant="over" style={{ color: colors.onBrandMuted }}>
              This week
            </Txt>
            <Txt variant="xl" style={{ color: colors.onBrand }}>
              {Math.min(thisWeek.length, goal)} of {goal}
              <Txt variant="label" style={{ color: colors.onBrandMuted }}>
                {"  "}reels made
              </Txt>
            </Txt>
            <ProgressBar value={thisWeek.length / goal} onBrand />
            <Txt variant="cap" style={{ color: colors.onBrandMuted }}>
              {making ? "One reel is being made right now" : `Free this week: ${billing.data?.freeVideosPerWeek ?? 3} standard reels`}
            </Txt>
          </Hero>
          {ready.length >= 3 ? <Win text={`You've made ${ready.length} reels. Keep going!`} /> : null}
          {making ? (
            <Button label="See the reel being made" block onPress={() => router.push(`/making/${making.id}`)} />
          ) : (
            <Button label="Make a reel" icon="sparkle" block onPress={() => router.push("/create")} />
          )}
        </>
      )}

      <Card>
        <Row style={{ justifyContent: "space-between" }}>
          <Txt variant="md">Your first week</Txt>
          <Txt variant="cap">{list.length > 0 ? 1 : 0} of 4</Txt>
        </Row>
        <CheckRow label="Make your first reel" done={list.length > 0} sub={list.length ? undefined : "About 2 minutes"} />
        <CheckRow label="Connect Instagram and YouTube" done={false} sub="Coming in the next beta" />
        <CheckRow label="Create your brand kit" done={false} sub="Coming in the next beta" />
        <CheckRow label="Make 5 reels this week" done={thisWeek.length >= 5} sub={`${Math.min(thisWeek.length, 5)} of 5`} />
      </Card>

      <Row style={{ justifyContent: "space-between" }}>
        <Txt variant="md">Your reels</Txt>
        {list.length > 4 ? <Button label="See all" kind="ghost" onPress={() => router.push("/reels")} /> : null}
      </Row>
      {films.data && list.length === 0 ? (
        <Empty title="No reels yet" text="Your reels will show up here. Make your first one in about 2 minutes." action={<Button label="Make my first reel" icon="sparkle" onPress={() => router.push("/create")} />} />
      ) : (
        <ReelGrid films={list.slice(0, 4)} />
      )}
    </Screen>
  );
}
