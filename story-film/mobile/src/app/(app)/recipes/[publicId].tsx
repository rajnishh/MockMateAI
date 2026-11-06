import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, Image, Pressable, Share, StyleSheet, View } from "react-native";

import { Icon } from "@/components/icon";
import { RecipeHasList, RecipeRail, ShapeList } from "@/components/recipes";
import { ReelThumb } from "@/components/reel-thumb";
import { ReelVideo } from "@/components/reel-video";
import { Banner, Button, Card, Empty, Header, Row, Screen, Skeleton, Txt } from "@/components/ui";
import { api, type Film } from "@/lib/api";
import { earnsLine, FORMAT_WORD, qualityLabel } from "@/lib/recipes";
import { useData } from "@/lib/use-data";
import { radius, useTheme } from "@/theme";

// A recipe (C4), or the maker's own (M5): the preview, what you bring and what the recipe has, the
// price for you and what the maker earns, Use this recipe, rails and Report.
export default function RecipeScreen() {
  const { publicId } = useLocalSearchParams<{ publicId: string }>();
  const { colors } = useTheme();
  const page = useData(() => api.recipe(publicId, "en"));
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const p = page.data;
  const r = p?.recipe;

  function stop() {
    Alert.alert("Stop sharing this recipe?", "It leaves Recipes and its link stops working. Reels people already made stay theirs.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Stop sharing",
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          try {
            await api.setRecipeSharing(publicId, false);
            router.back();
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  }

  function rename() {
    Alert.prompt?.("Recipe name", "People see this name. Keep it about the idea, not you.", async (name) => {
      if (!name?.trim()) return;
      try {
        await api.editRecipe(publicId, { name: name.trim().slice(0, 40) });
        page.reload();
      } catch (err) {
        setError((err as Error).message);
      }
    }, "plain-text", r?.name);
  }

  const share = () => {
    const link = api.recipeLink(publicId);
    Share.share({ message: `Make your own reel with this recipe: ${link}`, url: link }).catch(() => undefined);
  };
  const report = () => router.push({ pathname: "/listen/report/[id]", params: { id: publicId, kind: "recipe" } });

  if (page.error && !p) {
    const removed = /removed/.test(page.error);
    const gone = removed || /isn't shared/.test(page.error);
    return (
      <Screen>
        <Header title="Recipe" back />
        {gone ? (
          <Empty title={removed ? "This recipe was removed after a report." : "This recipe isn't shared any more"} text="Reels people already made with it stay theirs." action={<Button label="Back to recipes" kind="secondary" onPress={() => router.replace("/recipes")} />} />
        ) : (
          <Banner kind="error" text={page.error} action={<Button label="Try again" small kind="secondary" onPress={page.reload} />} />
        )}
      </Screen>
    );
  }

  const price = p?.price;
  const freeLine = price && price.quality !== "standard" ? `Or Standard · ${price.freeLeft ? `free (${price.freeLeft} left this week)` : `${price.standardCredits} credit`}` : null;
  return (
    <Screen
      footer={
        r ? (
          <Button
            label={p.mine ? "Make another like it" : "Use this recipe"}
            icon="sparkle"
            block
            onPress={() => router.push({ pathname: "/create", params: { recipe: publicId } })}
          />
        ) : undefined
      }>
      <Header
        title={r?.name ?? "Recipe"}
        back
        right={
          <Row style={{ gap: 4 }}>
            <Pressable accessibilityRole="button" accessibilityLabel="Share" hitSlop={8} onPress={share} style={styles.iconBtn}>
              <Icon name="share" size={20} color={colors.ink} />
            </Pressable>
            {p && !p.mine ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Report this recipe" hitSlop={8} onPress={report} style={styles.iconBtn}>
                <Icon name="flag" size={20} color={colors.ink} />
              </Pressable>
            ) : null}
          </Row>
        }
      />
      {!r ? (
        <Skeleton height={420} />
      ) : (
        <>
          <View style={styles.preview}>
            {r.previewUrl && playing ? (
              <ReelVideo film={{ videoUrl: r.previewUrl } as Film} autoPlay />
            ) : (
              <Pressable accessibilityRole="button" accessibilityLabel={r.previewUrl ? "Play the preview" : "This recipe's look"} disabled={!r.previewUrl} onPress={() => setPlaying(true)} style={{ flex: 1 }}>
                {api.recipePosterUrl(r.posterUrl) ? (
                  <Image source={{ uri: api.recipePosterUrl(r.posterUrl)! }} style={StyleSheet.absoluteFill} accessibilityIgnoresInvertColors />
                ) : (
                  <ReelThumb playable={Boolean(r.previewUrl)} />
                )}
              </Pressable>
            )}
          </View>
          <View style={{ gap: 6 }}>
            <Txt variant="lg">{r.name}</Txt>
            <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: "/recipes/c/[slug]", params: { slug: "all", maker: r.handle } })}>
              <Txt variant="label" color="tealText">{`by @${r.handle}`}</Txt>
            </Pressable>
            <Row style={{ gap: 6 }}>
              {[[FORMAT_WORD[r.format], r.styleLabel, `${r.durationSec} s`].filter(Boolean).join(" · "), "Made with AI", ...(r.kidSafe ? ["For kids"] : [])].map((t) => (
                <View key={t} style={[styles.pill, { backgroundColor: colors.tealTint }]}>
                  <Txt variant="cap" color="tealText">
                    {t}
                  </Txt>
                </View>
              ))}
            </Row>
            <Txt variant="cap">{`${r.useCount.toLocaleString(undefined, { notation: "compact" })} reels made`}</Txt>
          </View>
          {error ? <Banner kind="error" text={error} /> : null}
          {p.mine && p.stats ? (
            <Card>
              <Txt variant="md">Your recipe</Txt>
              <Txt>{`${p.stats.useCount} reels made · ${(p.stats.earnedHundredths / 100).toLocaleString(undefined, { maximumFractionDigits: 1 })} credits earned · ${p.stats.thisWeek} this week`}</Txt>
              <Row>
                <Button label="Edit name" small kind="secondary" icon="edit" onPress={rename} />
                <Button label="Stop sharing" small kind="danger" loading={busy} onPress={stop} />
              </Row>
              <Txt variant="cap">Your recipe · you don&apos;t earn from your own uses.</Txt>
            </Card>
          ) : null}
          <Card>
            <Txt variant="md">You bring</Txt>
            <Txt>{r.format === "edit" ? "Your video · The language you speak" : `Your topic${r.format === "story" ? " · Your photo (optional)" : ""} · Your language`}</Txt>
            <Txt variant="md">The recipe has</Txt>
            <RecipeHasList has={r.has} />
            {r.has.format === "story" ? <ShapeList has={r.has} /> : null}
          </Card>
          {price ? (
            <View style={[styles.price, { backgroundColor: colors.surfaceSunken }]}>
              <Txt variant="label">{price.credits ? `${qualityLabel(price.quality)} · ${price.credits} credits` : `${qualityLabel(price.quality)} · free`}</Txt>
              {freeLine ? <Txt variant="cap">{freeLine}</Txt> : null}
              <Txt variant="cap">{earnsLine(r.handle, p.makerEarns)}</Txt>
            </View>
          ) : !p.mine ? (
            <Txt variant="cap">{earnsLine(r.handle, undefined)}</Txt>
          ) : null}
          <RecipeRail title="More for this festival" cards={p.rails.sameFestival} onSeeAll={p.rails.occasion ? () => router.push({ pathname: "/recipes/c/[slug]", params: { slug: p.rails.occasion! } }) : undefined} />
          <RecipeRail title={`By @${r.handle}`} cards={p.rails.byMaker} />
          {!p.mine ? <Button label="Report this recipe" kind="ghost" icon="flag" onPress={report} style={{ alignSelf: "center" }} /> : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  preview: { width: "62%", aspectRatio: 9 / 16, alignSelf: "center", borderRadius: radius.lg, overflow: "hidden", backgroundColor: "#0b1220" },
  price: { borderRadius: radius.md, padding: 16, gap: 4 },
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
});
