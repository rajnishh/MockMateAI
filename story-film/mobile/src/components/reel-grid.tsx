import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";

import { api, type Film } from "@/lib/api";
import { formatLabel } from "@/lib/formats";
import { radius, useTheme } from "@/theme";
import { Icon } from "./icon";
import { ReelThumb } from "./reel-thumb";
import { reviewHref } from "@/lib/music-video";
import { ReelVideo } from "./reel-video";
import { Status, Txt } from "./ui";

export function filmStatus(f: Film) {
  if (f.status === "completed") return <Status kind="ok" text="Ready" />;
  if (f.status === "failed") return <Status kind="error" text="Failed" />;
  if (f.status === "review") return <Status kind="warn" text={f.songId ? "Check storyboard" : "Check effects"} />;
  return <Status kind="making" text="Making" />;
}

// The system alert, with a destructive Delete, so a reel is never removed by one stray tap.
export function confirmDelete(id: string, onDeleted: () => void, onError: (message: string) => void) {
  Alert.alert("Delete this reel?", "Its scheduled posts are cancelled too. This can't be undone.", [
    { text: "Keep it", style: "cancel" },
    {
      text: "Delete",
      style: "destructive",
      onPress: () => {
        api.deleteFilm(id).then(onDeleted, (err: Error) => onError(err.message));
      },
    },
  ]);
}

const canDelete = (f: Film) => f.status === "completed" || f.status === "failed" || f.status === "review";

// Ready reels play right in the grid (one at a time); the title opens the reel page.
// Long-press any finished or failed reel to delete it; failed ones also show a delete button.
export function ReelGrid({ films, columns = 2, onDeleted }: { films: Film[]; columns?: number; onDeleted?: () => void }) {
  const { colors } = useTheme();
  const [playing, setPlaying] = useState<string | null>(null);
  // Tabs and pushed screens stay mounted, so stop the inline video when this screen loses focus.
  useFocusEffect(useCallback(() => () => setPlaying(null), []));
  const open = (f: Film) => router.push(f.status === "completed" ? `/reel/${f.id}` : f.status === "review" ? reviewHref(f) : `/making/${f.id}`);
  const remove = (f: Film) =>
    confirmDelete(
      f.id,
      () => onDeleted?.(),
      (message) => Alert.alert("Couldn't delete", message),
    );

  return (
    <View style={styles.grid}>
      {films.map((f, i) => (
        <View key={f.id} style={[styles.cell, { width: `${100 / columns - 3}%` }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={f.status === "completed" ? `Play ${f.title ?? "reel"}` : (f.title ?? "Untitled reel")}
            accessibilityHint={onDeleted && canDelete(f) ? "Long-press to delete" : undefined}
            onPress={() => (f.status === "completed" ? setPlaying(playing === f.id ? null : f.id) : open(f))}
            onLongPress={onDeleted && canDelete(f) ? () => remove(f) : undefined}>
            {playing === f.id ? (
              <View style={styles.player}>
                <ReelVideo film={f} autoPlay compact />
              </View>
            ) : (
              <ReelThumb seed={i} playable={f.status === "completed"} />
            )}
          </Pressable>
          <Pressable accessibilityRole="link" onPress={() => open(f)} style={styles.meta}>
            <Txt variant="label" numberOfLines={2}>
              {f.title ?? f.story}
            </Txt>
            {formatLabel(f.format) ? <Txt variant="cap">{formatLabel(f.format)}</Txt> : null}
          </Pressable>
          <View style={styles.foot}>
            {filmStatus(f)}
            {onDeleted && f.status === "failed" ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Delete reel" hitSlop={10} onPress={() => remove(f)} style={styles.trash}>
                <Icon name="trash" size={18} color={colors.danger} />
              </Pressable>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 16 },
  cell: { gap: 6 },
  meta: { gap: 2 },
  player: { width: "100%", aspectRatio: 9 / 16, borderRadius: radius.md, overflow: "hidden" },
  foot: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  trash: { minWidth: 44, minHeight: 44, alignItems: "flex-end", justifyContent: "center" },
});
