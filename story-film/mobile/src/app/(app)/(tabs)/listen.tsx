import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";

import { SongRail } from "@/components/song-rail";
import { useSongPlayer } from "@/components/song-player";
import { Banner, Button, Empty, Hero, Screen, Skeleton, Txt } from "@/components/ui";
import { api, type PublicSongCard } from "@/lib/api";
import { publicTrackSong } from "@/lib/listen";
import { useData } from "@/lib/use-data";
import { radius, useTheme } from "@/theme";

// Listen: public songs from creators. Press play once and it keeps going (Autoplay in Up next).
export default function ListenTab() {
  const { colors } = useTheme();
  const player = useSongPlayer();
  const [lang, setLang] = useState<string | null>(null);
  const home = useData(() => api.listen(lang ?? undefined));
  const h = home.data;
  // Changing the language reloads (useData already loads on focus, so the first run is skipped).
  const first = useRef(true);
  const { reload } = home;
  useEffect(() => {
    if (first.current) first.current = false;
    else reload();
  }, [lang, reload]);

  const playAll = () => {
    if (!h) return;
    const all: PublicSongCard[] = [];
    for (const c of [...h.new, ...h.trending, ...h.bestOf.flatMap((b) => b.songs)]) if (!all.some((x) => x.publicId === c.publicId)) all.push(c);
    // Shuffled, so Play all isn't always the same order.
    const mix = all.map((c) => ({ c, k: Math.random() })).sort((a, b) => a.k - b.k).map((x) => publicTrackSong(x.c));
    player.playList(mix, 0);
  };

  const empty = h && !h.new.length;
  return (
    <Screen>
      <Hero>
        <Txt variant="over" style={{ color: colors.onBrandMuted }}>
          LISTEN
        </Txt>
        <Txt variant="xl" style={{ color: colors.onBrand }}>
          {h ? (h.newThisWeek ? `${h.newThisWeek} new ${h.newThisWeek === 1 ? "song" : "songs"} from creators` : "Songs from creators") : "Songs from creators"}
        </Txt>
        <Txt variant="body" style={{ color: colors.onBrandMuted }}>
          Hindi, Punjabi, Tamil, Arabic and more. Press play and it keeps going.
        </Txt>
        <Button label="Play all" icon="play" disabled={!h?.new.length} onPress={playAll} style={{ alignSelf: "flex-start" }} />
      </Hero>

      {h?.languages.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} accessibilityRole="tablist">
          {[{ code: null as string | null, native: "All", name: "All languages" }, ...h.languages].map((l) => {
            const on = lang === l.code;
            return (
              <Pressable
                key={l.code ?? "all"}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                accessibilityLabel={l.name}
                onPress={() => setLang(l.code)}
                style={[styles.chip, { backgroundColor: on ? colors.deep : colors.surfaceRaised, borderColor: on ? colors.deep : colors.lineStrong }]}>
                <Txt variant="label" style={{ color: on ? colors.onDeep : colors.ink }}>
                  {l.native}
                </Txt>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {home.error ? <Banner kind="error" text={home.error} action={<Button label="Retry" small kind="secondary" onPress={home.reload} />} /> : null}
      {!h && !home.error ? (
        <>
          <Skeleton height={200} />
          <Skeleton height={200} />
        </>
      ) : null}
      {empty ? (
        <Empty
          title={lang ? "No songs in this language yet" : "No public songs yet"}
          text="Make a song in Song Studio and tap Publish. It shows up here for everyone."
          action={<Button label="Go to Song Studio" icon="music" onPress={() => router.push("/songs")} />}
        />
      ) : null}
      {h ? (
        <>
          <SongRail title="New" songs={h.new} />
          <SongRail title="Trending this week" songs={h.trending} ranked />
          {h.bestOf.map((b) => (
            <SongRail key={b.genre} title={`Best of ${b.label}`} songs={b.songs} />
          ))}
          {!lang && h.languages.length > 1 ? (
            <View style={{ gap: 10 }}>
              <Txt variant="md" accessibilityRole="header">
                By language
              </Txt>
              <View style={styles.grid}>
                {h.languages.map((l) => (
                  <Pressable
                    key={l.code}
                    accessibilityRole="button"
                    accessibilityLabel={`${l.name}, ${l.count} ${l.count === 1 ? "song" : "songs"}`}
                    onPress={() => setLang(l.code)}
                    style={[styles.lang, { backgroundColor: colors.surfaceRaised, borderColor: colors.line }]}>
                    <Txt variant="md">{l.native}</Txt>
                    <Txt variant="cap">{`${l.name} · ${l.count}`}</Txt>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chip: { minHeight: 40, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  lang: { width: "47%", flexGrow: 1, minHeight: 72, borderRadius: radius.lg, borderWidth: 1, padding: 14, justifyContent: "center", gap: 2 },
});
