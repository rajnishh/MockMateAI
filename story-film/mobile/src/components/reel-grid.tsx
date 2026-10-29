import { router } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";

import type { Film } from "@/lib/api";
import { ReelThumb } from "./reel-thumb";
import { Status, Txt } from "./ui";

export function filmStatus(f: Film) {
  if (f.status === "completed") return <Status kind="ok" text="Ready" />;
  if (f.status === "failed") return <Status kind="error" text="Failed" />;
  return <Status kind="making" text="Making" />;
}

export function ReelGrid({ films, columns = 2 }: { films: Film[]; columns?: number }) {
  return (
    <View style={styles.grid}>
      {films.map((f, i) => (
        <Pressable
          key={f.id}
          accessibilityRole="link"
          accessibilityLabel={f.title ?? "Untitled reel"}
          onPress={() => router.push(f.status === "completed" ? `/reel/${f.id}` : `/making/${f.id}`)}
          style={[styles.cell, { width: `${100 / columns - 3}%` }]}>
          <ReelThumb seed={i} playable={f.status === "completed"} />
          <Txt variant="label" numberOfLines={2}>
            {f.title ?? f.story}
          </Txt>
          {filmStatus(f)}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 16 },
  cell: { gap: 6 },
});
