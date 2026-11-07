import { router } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { Icon } from "@/components/icon";
import { instantScrollProps } from "@/lib/instant-prefs";
import { INSTANT_CLEARANCE, InstantButton } from "@/components/instant-button";
import { ClipCard, DuetCard, GiftCard, OwnSongCard, Rail, RecipeTile, ReelCard } from "@/components/rail";
import { UnreadDot } from "@/components/tab-bar";
import { Banner, Button, Card, CheckRow, Credits, Hero, ListRow, ProgressBar, Row, Screen, Sheet, Txt } from "@/components/ui";
import { api } from "@/lib/api";
import { currentTake, hum, type Recording } from "@/lib/hum";
import { useInboxUnread } from "@/lib/inbox-unread";
import { reviewHref } from "@/lib/music-video";
import { profileTodo } from "@/lib/profile";
import { useSession } from "@/lib/session";
import { useData } from "@/lib/use-data";
import { useTheme } from "@/theme";

const WEEK = 7 * 86400000;
// Each rail shows the newest few; "See all" has the rest.
const RAIL = 10;

// "Today 7:30 pm", "Tomorrow 9:00 am" or "Fri 7:30 pm".
function nextPostTime(iso: string, now: number): string {
  const d = new Date(iso);
  const days = Math.round((new Date(d.toDateString()).getTime() - new Date(new Date(now).toDateString()).getTime()) / 86400000);
  const day = days === 0 ? "Today" : days === 1 ? "Tomorrow" : d.toLocaleDateString(undefined, { weekday: "short" });
  return `${day} ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}

// Home (design/home-v3/spec.md): your own reels, songs, clips, duets, gifts and recipes, each one
// tap to play or open. The Hero's Make a reel is the one main action.
export default function Home() {
  const { user, prefs } = useSession();
  const branded = Boolean(prefs?.brand?.accent || prefs?.brand?.handle);
  const { colors } = useTheme();
  const films = useData(() => api.films());
  const billing = useData(() => api.billing());
  const accounts = useData(() => api.accounts());
  const profile = useData(() => api.profile());
  const studio = useData(() => api.songs());
  const clips = useData(() => hum.recordings());
  const duets = useData(() => api.duets());
  const gifts = useData(() => api.gifts());
  const handle = profile.data?.handle;
  const connected = (accounts.data?.accounts.length ?? 0) > 0;
  const unread = useInboxUnread() > 0;
  const [weekOpen, setWeekOpen] = useState(false);
  const [clipError, setClipError] = useState<string | null>(null);

  // Captured once per visit so filtering stays pure during render.
  const [now] = useState(() => Date.now());
  // Failed reels don't count or show here; the newest one, if it's the latest reel, gets Try again.
  const all = films.data ?? [];
  const list = all.filter((f) => f.status !== "failed");
  const lastFailed = all[0]?.status === "failed" ? all[0] : undefined;
  const thisWeek = list.filter((f) => now - new Date(f.createdAt).getTime() < WEEK);
  const ready = list.filter((f) => f.status === "completed");
  const making = list.find((f) => f.status === "queued" || f.status === "running");
  const toCheck = list.find((f) => f.status === "review");
  const goal = 5;
  // Until it's loaded, don't nag.
  const profileDone = profile.data?.complete ?? true;
  const posts = useData(() => api.posts(new Date(now), new Date(now + WEEK)));
  const nextPost = (posts.data ?? []).filter((p) => p.status === "scheduled").sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))[0];
  const songs = studio.data?.songs ?? [];
  const together = [
    ...(duets.data ?? []).filter((d) => d.phase !== "cancelled").map((d) => ({ at: d.createdAt, duet: d, gift: null })),
    ...(gifts.data?.sent ?? []).filter((g) => !g.isReply).map((g) => ({ at: g.createdAt, duet: null, gift: g })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  const week = [list.length > 0, profileDone, connected, branded, thisWeek.length >= 5];
  const weekDone = week.filter(Boolean).length;
  const nextTodo = !list.length ? "Make your first reel" : !profileDone ? "Finish your profile" : !connected ? "Connect Instagram or YouTube" : !branded ? "Set your brand look" : "Make 5 reels this week";

  // Today's "make something with it" from My recordings.
  async function makeFromClip(r: Recording) {
    setClipError(null);
    try {
      const [take, file] = await Promise.all([hum.recording(r.id), r.video ? Promise.resolve({ uri: "", name: "clip", type: "video/mp4" }) : hum.download(r.id)]);
      currentTake.set(take, file);
      router.push("/hum/confirm");
    } catch (err) {
      setClipError((err as Error).message);
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <Screen scrollProps={instantScrollProps}>
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

      {making || toCheck || lastFailed ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push(making ? `/making/${making.id}` : toCheck ? reviewHref(toCheck) : `/making/${lastFailed!.id}`)}
          style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderRadius: 14, backgroundColor: colors.deep, opacity: pressed ? 0.9 : 1 })}>
          <Icon name={making ? "film" : toCheck ? "check" : "refresh"} color={colors.onDeep} />
          <View style={{ flex: 1, gap: 2 }}>
            <Txt variant="label" style={{ color: colors.onDeep }}>
              {making ? "Your reel is being made" : toCheck ? "Your video is ready to check" : "Your last reel couldn't be made"}
            </Txt>
            <Txt variant="cap" style={{ color: colors.onDeep, opacity: 0.75 }}>
              {making ? "About 2 minutes. We'll let you know." : toCheck ? "Look over its effects, then render it." : "Nothing was charged. Try it again in one tap."}
            </Txt>
          </View>
          <Txt variant="label" color="teal">
            {making ? "See it" : toCheck ? "Check" : "Try again"}
          </Txt>
        </Pressable>
      ) : null}

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
          {ready.length >= 3 ? `You've made ${ready.length} reels. Keep going!` : `Free this week: ${billing.data?.freeVideosPerWeek ?? 3} standard reels`}
        </Txt>
        <Button label={list.length || !films.data ? "Make a reel" : "Make my first reel"} icon="sparkle" block onPress={() => router.push("/create")} />
      </Hero>

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

      {films.data && !list.length ? (
        <Txt variant="cap">Your reels will show up here.</Txt>
      ) : (
        <Rail title="My reels" loading={films.loading && !films.data} error={Boolean(films.error) && !films.data} onRetry={films.reload} onSeeAll={list.length > 3 ? () => router.push("/reels") : undefined}>
          {list.slice(0, RAIL).map((f, i) => (
            <ReelCard key={f.id} film={f} index={i} list={list.slice(0, RAIL)} onDeleted={films.reload} />
          ))}
        </Rail>
      )}

      {studio.data && !songs.length ? (
        <Card>
          <Row style={{ alignItems: "center" }}>
            <Icon name="music" color={colors.tealText} />
            <View style={{ flex: 1, gap: 2 }}>
              <Txt variant="label">Make a song in your language</Txt>
              <Txt variant="cap">Ready in about 2 minutes</Txt>
            </View>
            <Button label="Make a song" small kind="secondary" onPress={() => router.push("/songs/new")} />
          </Row>
        </Card>
      ) : (
        <Rail title="My songs" skeleton={{ width: 128, height: 190 }} loading={studio.loading && !studio.data} error={Boolean(studio.error) && !studio.data} onRetry={studio.reload} onSeeAll={songs.length > 3 ? () => router.push("/songs") : undefined}>
          {songs.slice(0, RAIL).map((s) => (
            <OwnSongCard key={s.id} song={s} songs={songs.slice(0, RAIL)} />
          ))}
        </Rail>
      )}

      {clips.data?.length ? (
        <Rail title="My recordings" onSeeAll={clips.data.length > 3 ? () => router.push("/hum/recordings") : undefined}>
          {clips.data.slice(0, RAIL).map((r) => (
            <ClipCard key={r.id} recording={r} onMore={() => makeFromClip(r)} />
          ))}
        </Rail>
      ) : null}
      {clipError ? <Banner kind="error" text={clipError} /> : null}

      {together.length ? (
        <Rail title="Duets and gifts" onSeeAll={together.length > 3 ? () => router.push("/inbox") : undefined}>
          {together.slice(0, RAIL).map((t) => (t.duet ? <DuetCard key={`d${t.duet.id}`} duet={t.duet} /> : <GiftCard key={`g${t.gift!.id}`} gift={t.gift!} song={songs.find((s) => s.id === t.gift!.songId)} />))}
        </Rail>
      ) : null}

      {handle ? <MyRecipes handle={handle} /> : null}

      {weekDone < 5 ? (
        <Card>
          <ListRow icon="check" title={`Your first week · ${weekDone} of 5`} sub={nextTodo} onPress={() => setWeekOpen(true)} />
        </Card>
      ) : null}

      <Sheet visible={weekOpen} onClose={() => setWeekOpen(false)}>
        <Txt variant="md" accessibilityRole="header">{`Your first week · ${weekDone} of 5`}</Txt>
        <CheckRow label="Make your first reel" done={list.length > 0} sub={list.length ? undefined : "About 2 minutes"} />
        <CheckRow
          label="Finish your profile"
          done={profileDone}
          sub={profileDone ? undefined : profileTodo(profile.data?.missing)}
          action={profileDone || !profile.data ? undefined : <Button label="Finish" small kind="secondary" onPress={() => (setWeekOpen(false), router.push("/edit-profile"))} />}
        />
        <CheckRow
          label="Connect Instagram or YouTube"
          done={connected}
          sub={connected ? undefined : "2 minutes"}
          action={connected ? undefined : <Button label="Connect" small kind="secondary" onPress={() => (setWeekOpen(false), router.push("/connections"))} />}
        />
        <CheckRow
          label="Set your brand look"
          done={branded}
          sub="Your colour and handle on motion reels"
          action={branded ? undefined : <Button label="Set up" small kind="secondary" onPress={() => (setWeekOpen(false), router.push("/account"))} />}
        />
        <CheckRow label="Make 5 reels this week" done={thisWeek.length >= 5} sub={`${Math.min(thisWeek.length, 5)} of 5`} />
      </Sheet>
      <View style={{ height: INSTANT_CLEARANCE }} />
      </Screen>
      <InstantButton />
    </View>
  );
}

// Recipes you shared; needs your @username, so it loads once the profile has.
function MyRecipes({ handle }: { handle: string }) {
  const recipes = useData(() => api.recipeList({ maker: handle }).then((r) => r.recipes));
  if (!recipes.data?.length) return null;
  return (
    <Rail title="My recipes" onSeeAll={recipes.data.length > 3 ? () => router.push("/recipes") : undefined}>
      {recipes.data.slice(0, RAIL).map((r, i) => (
        <RecipeTile key={r.publicId} recipe={r} index={i} />
      ))}
    </Rail>
  );
}
