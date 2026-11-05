import { router } from "expo-router";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";

import type { PublicSongCard } from "@/lib/api";
import { publicTrackSong } from "@/lib/listen";
import { fonts, radius, useTheme } from "@/theme";
import { SongCover } from "./song-cover";
import { useSongPlayer } from "./song-player";
import { Txt } from "./ui";

// More for one song: Play next, Add to queue, Open the song page.
export function songMenu(card: PublicSongCard, player: ReturnType<typeof useSongPlayer>) {
  const s = publicTrackSong(card);
  Alert.alert(card.title, `@${card.handle}`, [
    { text: "Play next", onPress: () => player.playNext(s) },
    { text: "Add to queue", onPress: () => player.addToQueue(s) },
    { text: "Open song", onPress: () => router.push({ pathname: "/s/[id]", params: { id: card.publicId } }) },
    { text: "Cancel", style: "cancel" },
  ]);
}

// A row of public songs. Tapping one plays it and queues the rest of the row; long-press for more.
export function SongRail({ title, songs, ranked, onSeeAll }: { title: string; songs: PublicSongCard[]; ranked?: boolean; onSeeAll?: () => void }) {
  const { colors } = useTheme();
  const player = useSongPlayer();
  if (!songs.length) return null;
  return (
    <View style={{ gap: 10 }}>
      <View style={styles.head}>
        <Txt variant="md" accessibilityRole="header" style={{ flex: 1 }}>
          {title}
        </Txt>
        {onSeeAll ? (
          <Pressable accessibilityRole="button" onPress={onSeeAll} hitSlop={8}>
            <Txt variant="label" color="tealText">
              See all
            </Txt>
          </Pressable>
        ) : null}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingRight: 16 }}>
        {songs.map((c, i) => {
          const playing = player.song?.publicId === c.publicId;
          return (
            <Pressable
              key={c.publicId}
              accessibilityRole="button"
              accessibilityLabel={`${ranked ? `Number ${i + 1}. ` : ""}${c.title} by @${c.handle}, ${c.languageLabel}`}
              accessibilityHint="Plays this song. Long-press for more"
              onPress={() => player.playList(songs.map(publicTrackSong), i)}
              onLongPress={() => songMenu(c, player)}
              style={({ pressed }) => [styles.tile, { opacity: pressed ? 0.85 : 1 }]}>
              <View style={[styles.art, playing ? { borderColor: colors.action } : null]}>
                <SongCover song={publicTrackSong(c)} size={140} radius={radius.lg - 2} />
                {ranked ? (
                  <View style={[styles.rank, { backgroundColor: colors.deep }]}>
                    <Txt variant="label" style={{ color: colors.onDeep, fontFamily: fonts.extrabold }}>
                      {i + 1}
                    </Txt>
                  </View>
                ) : null}
              </View>
              <Txt variant="label" numberOfLines={2}>
                {c.title}
              </Txt>
              <Txt variant="cap" numberOfLines={1}>
                {`@${c.handle} · ${c.languageLabel}`}
              </Txt>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: 8 },
  tile: { width: 144, gap: 4 },
  art: { borderRadius: radius.lg, borderWidth: 2, borderColor: "transparent", overflow: "hidden" },
  rank: { position: "absolute", top: 8, left: 8, minWidth: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
});
