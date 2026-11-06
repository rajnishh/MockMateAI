import { router } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { Icon } from "@/components/icon";

import { ReelGrid } from "@/components/reel-grid";
import { UnreadDot } from "@/components/tab-bar";
import { Banner, Button, Card, CheckRow, Credits, Empty, Hero, ListRow, ProgressBar, Row, Screen, Skeleton, Txt, Win } from "@/components/ui";
import { api } from "@/lib/api";
import { useInboxUnread } from "@/lib/inbox-unread";
import { reviewHref } from "@/lib/music-video";
import { profileTodo } from "@/lib/profile";
import { useSession } from "@/lib/session";
import { useData } from "@/lib/use-data";
import { useTheme } from "@/theme";

const WEEK = 7 * 86400000;

// "Today 7:30 pm", "Tomorrow 9:00 am" or "Fri 7:30 pm".
function nextPostTime(iso: string, now: number): string {
  const d = new Date(iso);
  const days = Math.round((new Date(d.toDateString()).getTime() - new Date(new Date(now).toDateString()).getTime()) / 86400000);
  const day = days === 0 ? "Today" : days === 1 ? "Tomorrow" : d.toLocaleDateString(undefined, { weekday: "short" });
  return `${day} ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}

export default function Home() {
  const { user, prefs } = useSession();
  const branded = Boolean(prefs?.brand?.accent || prefs?.brand?.handle);
  const { colors } = useTheme();
  const films = useData(() => api.films());
  const billing = useData(() => api.billing());
  const accounts = useData(() => api.accounts());
  const profile = useData(() => api.profile());
  const connected = (accounts.data?.accounts.length ?? 0) > 0;
  const unread = useInboxUnread() > 0;

  // Captured once per visit so filtering stays pure during render.
  const [now] = useState(() => Date.now());
  const list = films.data ?? [];
  const thisWeek = list.filter((f) => now - new Date(f.createdAt).getTime() < WEEK);
  const ready = list.filter((f) => f.status === "completed");
  const making = list.find((f) => f.status === "queued" || f.status === "running");
  const toCheck = list.find((f) => f.status === "review");
  const goal = 5;
  // Until it's loaded, don't nag.
  const profileDone = profile.data?.complete ?? true;
  const posts = useData(() => api.posts(new Date(now), new Date(now + WEEK)));
  const nextPost = (posts.data ?? []).filter((p) => p.status === "scheduled").sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))[0];

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
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={unread ? "Inbox, new messages" : "Inbox"}
            onPress={() => router.push("/inbox")}
            style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
            <Icon name="bell" color={colors.ink} />
            {unread ? <UnreadDot ring={colors.surface} /> : null}
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
          <Card onPress={() => router.push("/ask")}>
            <Row style={{ alignItems: "center" }}>
              <Icon name="sparkle" color={colors.tealText} />
              <View style={{ flex: 1, gap: 2 }}>
                <Txt variant="label">Ask Reelkar</Txt>
                <Txt variant="cap">Tell me what to make and when to post. I&apos;ll do the rest.</Txt>
              </View>
              <Icon name="right" color={colors.inkMuted} size={18} />
            </Row>
          </Card>
          <Card onPress={() => router.push("/studio")}>
            <Row style={{ alignItems: "center" }}>
              <Icon name="music" color={colors.tealText} />
              <View style={{ flex: 1, gap: 2 }}>
                <Txt variant="label">Song Studio</Txt>
                <Txt variant="cap">Write a song about anything and hear it sung, in Hindi, Hinglish and more.</Txt>
              </View>
              <Icon name="right" color={colors.inkMuted} size={18} />
            </Row>
          </Card>
          <Card onPress={() => router.push("/listen")}>
            <Row style={{ alignItems: "center" }}>
              <Icon name="headphones" color={colors.tealText} />
              <View style={{ flex: 1, gap: 2 }}>
                <Txt variant="label">New on Listen</Txt>
                <Txt variant="cap">Songs from other creators, in many languages. Press play and it keeps going.</Txt>
              </View>
              <Icon name="right" color={colors.inkMuted} size={18} />
            </Row>
          </Card>
          {toCheck ? (
            <Banner kind="info" title="Your video is ready to check" text="Look over its effects, then render it." action={<Button label="Check" small onPress={() => router.push(reviewHref(toCheck))} />} />
          ) : null}
          {making ? (
            <Button label="See the reel being made" block onPress={() => router.push(`/making/${making.id}`)} />
          ) : (
            <Button label="Make a reel" icon="sparkle" block onPress={() => router.push("/create")} />
          )}
        </>
      )}

      {nextPost ? (
        <Card>
          <ListRow
            icon="calendar"
            title={`Next post · ${nextPostTime(nextPost.scheduledAt, now)}`}
            sub={nextPost.accountName ? `${nextPost.title} to ${nextPost.accountName}` : nextPost.title}
            onPress={() => router.push("/calendar")}
          />
        </Card>
      ) : null}

      <Card>
        <Row style={{ justifyContent: "space-between" }}>
          <Txt variant="md">Your first week</Txt>
          <Txt variant="cap">{(list.length > 0 ? 1 : 0) + (profileDone ? 1 : 0) + (connected ? 1 : 0) + (branded ? 1 : 0) + (thisWeek.length >= 5 ? 1 : 0)} of 5</Txt>
        </Row>
        <CheckRow label="Make your first reel" done={list.length > 0} sub={list.length ? undefined : "About 2 minutes"} />
        <CheckRow
          label="Finish your profile"
          done={profileDone}
          sub={profileDone ? undefined : profileTodo(profile.data?.missing)}
          action={profileDone || !profile.data ? undefined : <Button label="Finish" small kind="secondary" onPress={() => router.push("/edit-profile")} />}
        />
        <CheckRow
          label="Connect Instagram or YouTube"
          done={connected}
          sub={connected ? undefined : "2 minutes"}
          action={connected ? undefined : <Button label="Connect" small kind="secondary" onPress={() => router.push("/connections")} />}
        />
        <CheckRow
          label="Set your brand look"
          done={branded}
          sub="Your colour and handle on motion reels"
          action={branded ? undefined : <Button label="Set up" small kind="secondary" onPress={() => router.push("/account")} />}
        />
        <CheckRow label="Make 5 reels this week" done={thisWeek.length >= 5} sub={`${Math.min(thisWeek.length, 5)} of 5`} />
      </Card>

      <Row style={{ justifyContent: "space-between" }}>
        <Txt variant="md">Your reels</Txt>
        {list.length > 4 ? <Button label="See all" kind="ghost" onPress={() => router.push("/reels")} /> : null}
      </Row>
      {films.data && list.length === 0 ? (
        <Empty title="No reels yet" text="Your reels will show up here. Make your first one in about 2 minutes." action={<Button label="Make my first reel" icon="sparkle" onPress={() => router.push("/create")} />} />
      ) : (
        <ReelGrid films={list.slice(0, 4)} onDeleted={films.reload} />
      )}
    </Screen>
  );
}
