import { router } from "expo-router";
import { Alert, Pressable, StyleSheet, View } from "react-native";

import { api, type Film } from "@/lib/api";
import { formatLabel } from "@/lib/formats";
import { useTheme } from "@/theme";
import { Icon } from "./icon";
import { ReelThumb } from "./reel-thumb";
import { reviewHref } from "@/lib/music-video";
import { viewerList } from "@/lib/viewer-list";
import { Status, Txt } from "./ui";

export function filmStatus(f: Film) {
  if (f.status === "completed") return <Status kind="ok" text="Ready" />;
  if (f.status === "failed") return <Status kind="error" text="Failed" />;
  if (f.status === "review") return <Status kind="warn" text={f.songId ? "Check storyboard" : "Check effects"} />;
  return <Status kind="making" text="Making" />;
}

// The system alert, with a destructive Delete, so a reel is never removed by one stray tap.
// A reel shared as a recipe asks whether the recipe goes too; it can stay (it keeps its own preview and music).
export function confirmDelete(id: string, onDeleted: () => void, onError: (message: string) => void, hasRecipe = false) {
  const remove = (keepRecipe: boolean) => api.deleteFilm(id, keepRecipe).then(onDeleted, (err: Error) => onError(err.message));
  if (hasRecipe) {
    Alert.alert("Delete this reel?", "It's shared as a recipe. Its scheduled posts are cancelled too. This can't be undone.", [
      { text: "Delete reel and recipe", style: "destructive", onPress: () => remove(false) },
      { text: "Delete reel, keep recipe", style: "destructive", onPress: () => remove(true) },
      { text: "Cancel", style: "cancel" },
    ]);
    return;
  }
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

// Ready reels open full screen (swipe for the next); the title opens the reel page.
// Long-press any finished or failed reel to delete it; failed ones also show a delete button.
export function ReelGrid({ films, columns = 2, onDeleted }: { films: Film[]; columns?: number; onDeleted?: () => void }) {
  const { colors } = useTheme();
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
            onPress={() => (f.status === "completed" && f.videoUrl ? (viewerList.set(films), router.push(`/watch/${f.id}`)) : open(f))}
            onLongPress={onDeleted && canDelete(f) ? () => remove(f) : undefined}>
            <ReelThumb seed={i} playable={f.status === "completed"} />
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
  foot: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  trash: { minWidth: 44, minHeight: 44, alignItems: "flex-end", justifyContent: "center" },
});
