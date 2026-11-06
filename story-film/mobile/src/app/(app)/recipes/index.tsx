import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { FestivalCard, RecipeRail } from "@/components/recipes";
import { Banner, Button, ChipRow, Credits, Header, Screen, Skeleton, Txt } from "@/components/ui";
import { api, type RecipeCard, type RecipeFormat } from "@/lib/api";
import { useData } from "@/lib/use-data";
import { radius, useTheme } from "@/theme";

type Format = RecipeFormat | "all";
const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";

// The recipes gallery (C2): this festival, rails by format, and every festival collection.
export default function Recipes() {
  const { colors } = useTheme();
  const billing = useData(() => api.billing());
  const home = useData(() => api.recipesHome("en", tz()));
  const [format, setFormat] = useState<Format>("all");
  const h = home.data;
  const only = (cards: RecipeCard[]) => (format === "all" ? cards : cards.filter((c) => c.format === format));

  return (
    <Screen>
      <Header title="Recipes" back right={<Credits count={billing.data?.balance ?? null} />} />
      {home.error ? <Banner kind={h ? "warn" : "error"} text={h ? "You're offline. Showing recipes from earlier." : home.error} action={<Button label="Try again" small kind="secondary" onPress={home.reload} />} /> : null}
      {!h ? (
        home.error ? null : (
          <>
            <Skeleton height={200} />
            <Skeleton height={240} />
          </>
        )
      ) : (
        <>
          {h.festival ? <FestivalCard festival={h.festival} thumbs={h.festival.thumbs} /> : null}
          <ChipRow<Format>
            options={[
              { value: "all", label: "All" },
              { value: "story", label: "Story" },
              { value: "motion", label: "Motion" },
              { value: "dance", label: "Kids dance" },
              { value: "edit", label: "Edit my video" },
            ]}
            value={format}
            onChange={setFormat}
          />
          <RecipeRail title="Trending this week" cards={only(h.rails.trending)} />
          <RecipeRail title="New" cards={only(h.rails.new)} />
          <RecipeRail title="Free to make" cards={only(h.rails.free)} />
          <RecipeRail title="For kids" cards={only(h.rails.kids)} />
          <Txt variant="md" accessibilityRole="header">
            Festivals
          </Txt>
          <View style={styles.grid}>
            {h.collections.map((c) => (
              <Pressable
                key={c.slug}
                accessibilityRole="button"
                accessibilityLabel={`${c.nameEn}, ${c.count} recipes`}
                onPress={() => router.push({ pathname: "/recipes/c/[slug]", params: { slug: c.slug } })}
                style={[styles.tile, { backgroundColor: colors.surfaceRaised, borderColor: colors.line }]}>
                <Txt variant="md">{c.native.hi !== c.nameEn && !c.allYear ? c.native.hi : c.nameEn}</Txt>
                <Txt variant="cap">{[c.nameEn, c.date ? new Date(`${c.date}T00:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" }) : "All year", `${c.count}`].join(" · ")}</Txt>
              </Pressable>
            ))}
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  tile: { width: "47%", minHeight: 84, borderRadius: radius.lg, borderWidth: 1, padding: 14, gap: 4, justifyContent: "center" },
});
