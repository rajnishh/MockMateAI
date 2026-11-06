import { router } from "expo-router";
import { Image, Pressable, ScrollView, Share, StyleSheet, View } from "react-native";

import type { FestivalInfo, FilmRecipe, RecipeCard as Card_, RecipeHas } from "@/lib/api";
import { api } from "@/lib/api";
import { FORMAT_WORD, recipeMeta, ROLE_LABEL } from "@/lib/recipes";
import { fonts, radius, useTheme } from "@/theme";
import { Icon, type IconName } from "./icon";
import { ReelThumb } from "./reel-thumb";
import { Button, Card, Hero, ListRow, Row, Status, Txt } from "./ui";

// Reel recipes in the app (design/community/recipes-spec.md): tiles, rails, the festival card, the
// finished reel's Share as a recipe card, and Create's locked recipe card.

function Poster({ url, width, seed = 0 }: { url: string | null; width: number; seed?: number }) {
  const uri = api.recipePosterUrl(url);
  if (!uri) return <ReelThumb seed={seed} width={width} />;
  return <Image source={{ uri }} style={{ width, aspectRatio: 9 / 16, borderRadius: radius.md }} accessibilityIgnoresInvertColors />;
}

// One 9:16 tile: poster, a format badge, "Free" when it uses the free weekly reels, the name and maker.
export function RecipeTile({ card, width = 120, seed = 0 }: { card: Card_; width?: number; seed?: number }) {
  const { colors } = useTheme();
  const label = `${card.name}, a ${FORMAT_WORD[card.format].toLowerCase()} recipe by @${card.handle}, ${card.durationSec} seconds, ${card.useCount.toLocaleString()} reels made.${card.free ? " Free." : ""}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => router.push({ pathname: "/recipes/[publicId]", params: { publicId: card.publicId } })}
      onLongPress={() => router.push({ pathname: "/listen/report/[id]", params: { id: card.publicId, kind: "recipe" } })}
      style={({ pressed }) => [{ width, gap: 4, opacity: pressed ? 0.85 : 1 }]}>
      <View>
        <Poster url={card.posterUrl} width={width} seed={seed} />
        <View style={[styles.badge, { backgroundColor: colors.pop }]}>
          <Txt variant="cap" style={{ color: colors.onPop, fontFamily: fonts.bold }}>
            {FORMAT_WORD[card.format]}
          </Txt>
        </View>
        {card.free ? (
          <View style={[styles.free, { backgroundColor: colors.teal }]}>
            <Txt variant="cap" style={{ color: colors.onTeal, fontFamily: fonts.bold }}>
              Free
            </Txt>
          </View>
        ) : null}
      </View>
      <Txt variant="label" numberOfLines={2}>
        {card.name}
      </Txt>
      <Txt variant="cap" numberOfLines={1}>{`@${card.handle} · ${card.useCount.toLocaleString(undefined, { notation: "compact" })} made`}</Txt>
    </Pressable>
  );
}

export function RecipeRail({ title, cards, onSeeAll }: { title: string; cards: Card_[]; onSeeAll?: () => void }) {
  if (!cards.length) return null;
  return (
    <View style={{ gap: 10 }}>
      <Row style={{ alignItems: "center" }}>
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
      </Row>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingRight: 16 }}>
        {cards.map((c, i) => (
          <RecipeTile key={c.publicId} card={c} seed={i} />
        ))}
      </ScrollView>
    </View>
  );
}

// "Diwali · in 2 days": the one hero on Create while a festival is near.
export function FestivalCard({ festival, thumbs }: { festival: FestivalInfo; thumbs: Card_[] }) {
  const { colors } = useTheme();
  const when = festival.inDays === null ? "" : festival.inDays > 1 ? ` · in ${festival.inDays} days` : festival.inDays === 1 ? " · tomorrow" : festival.inDays === 0 ? " · today" : "";
  return (
    <Hero>
      <Txt variant="over" color="onBrandMuted">{`${festival.name}${when}`}</Txt>
      <Txt variant="lg" color="onBrand">{`${festival.name} reels, ready to make`}</Txt>
      {thumbs.length ? (
        <Row style={{ gap: 0 }}>
          {thumbs.slice(0, 3).map((c, i) => (
            <View key={c.publicId} style={[styles.fan, { marginLeft: i ? -14 : 0, borderColor: colors.heroRing }]}>
              <Poster url={c.posterUrl} width={56} seed={i} />
            </View>
          ))}
        </Row>
      ) : null}
      <Button label={`See ${festival.name} recipes`} onPress={() => router.push({ pathname: "/recipes/c/[slug]", params: { slug: festival.slug } })} />
    </Hero>
  );
}

// Rows of what a recipe has: look, shape, music, length.
export function RecipeHasList({ has, locked }: { has: RecipeHas; locked?: boolean }) {
  const { colors } = useTheme();
  const rows = recipeMeta(has);
  return (
    <View style={{ gap: 4 }}>
      {rows.map((r) => (
        <View key={r.label} accessibilityLabel={locked ? `Locked by the recipe: ${r.value}` : `${r.label}: ${r.value}`} style={styles.keep}>
          <Icon name={locked ? "lock" : "check"} size={18} color={locked ? colors.inkMuted : colors.tealText} />
          <Txt variant="label" style={{ flex: 1 }}>{`${r.label}: ${r.value}`}</Txt>
        </View>
      ))}
    </View>
  );
}

// The numbered script shape: hook, beats, payoff, each with its intent.
export function ShapeList({ has }: { has: Extract<RecipeHas, { format: "story" }> }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 8 }}>
      {has.shape.shots.map((s, i) => {
        const hook = s.role === "hook";
        return (
          <Row key={i} style={{ flexWrap: "nowrap", alignItems: "flex-start" }}>
            <View style={[styles.num, { backgroundColor: hook ? colors.deep : colors.surfaceSunken }]}>
              <Txt variant="label" style={{ color: hook ? colors.onDeep : colors.ink }}>
                {i + 1}
              </Txt>
            </View>
            <View style={{ flex: 1 }}>
              <Txt variant="label">{ROLE_LABEL[s.role]}</Txt>
              <Txt variant="cap">{s.intent}</Txt>
            </View>
          </Row>
        );
      })}
    </View>
  );
}

// What stays private when sharing.
export function PrivateList() {
  const { colors } = useTheme();
  const rows: [IconName, string][] = [
    ["lock", "Your idea and words"],
    ["lock", "Your photo and characters"],
    ["lock", "Your brand look and handle"],
  ];
  return (
    <View style={{ gap: 4 }}>
      {rows.map(([icon, text]) => (
        <View key={text} style={styles.keep}>
          <Icon name={icon} size={18} color={colors.inkMuted} />
          <Txt variant="label" style={{ flex: 1 }}>
            {text}
          </Txt>
        </View>
      ))}
    </View>
  );
}

// M1 on the finished reel: share it as a recipe, its numbers once shared, or who it came from.
export function ShareAsRecipeCard({ filmId, info }: { filmId: string; info: FilmRecipe }) {
  const { colors } = useTheme();
  if (info.madeFrom) {
    return (
      <Card flat>
        <ListRow icon="recipe" title={`Recipe by @${info.madeFrom.handle}`} sub={info.madeFrom.name} onPress={() => router.push({ pathname: "/recipes/[publicId]", params: { publicId: info.madeFrom!.publicId } })} />
      </Card>
    );
  }
  const r = info.recipe;
  if (r?.state === "taken_down") {
    return (
      <Card>
        <Status kind="error" text="Removed after a report" />
        <Txt variant="cap">It isn&apos;t shared any more.</Txt>
      </Card>
    );
  }
  if (r) {
    return (
      <Card>
        <Status kind={r.state === "public" ? "ok" : "warn"} text={r.state === "public" ? "Shared as a recipe" : "You stopped sharing this recipe"} />
        <Txt variant="cap">{`${r.useCount} reels made · ${(r.earnedHundredths / 100).toLocaleString(undefined, { maximumFractionDigits: 1 })} credits earned`}</Txt>
        <Txt variant="mono" selectable>
          {r.url.replace(/^https?:\/\//, "")}
        </Txt>
        <Row>
          {r.state === "public" ? <Button label="Share link" icon="share" small kind="secondary" onPress={() => Share.share({ message: `Make your own reel with my recipe: ${r.url}`, url: r.url }).catch(() => undefined)} /> : null}
          <Button label="See recipe" small kind="ghost" onPress={() => router.push({ pathname: "/recipes/[publicId]", params: { publicId: r.publicId } })} />
        </Row>
      </Card>
    );
  }
  if (!info.eligible) return null;
  return (
    <Card>
      <Row style={{ flexWrap: "nowrap", alignItems: "flex-start" }}>
        <View style={[styles.icon, { backgroundColor: colors.tealTint }]}>
          <Icon name="recipe" size={22} color={colors.tealText} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="md">Share as a recipe</Txt>
          <Txt variant="cap">Others make their own reel with this look, script shape and music. You earn credits each time.</Txt>
        </View>
      </Row>
      <Button label="Share as a recipe" kind="secondary" icon="recipe" onPress={() => router.push({ pathname: "/recipes/share/[id]", params: { id: filmId } })} />
    </Card>
  );
}

// C5: the recipe at the top of Create, with what it locks.
export function RecipeLockCard({ card, has, onWithout }: { card: Card_; has: RecipeHas; onWithout: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.lock, { borderColor: colors.line, backgroundColor: colors.surfaceRaised }]}>
      <View style={[styles.strip, { backgroundColor: colors.tealTint }]}>
        <Icon name="recipe" size={16} color={colors.tealText} />
        <Txt variant="label" color="tealText">
          Recipe
        </Txt>
      </View>
      <View style={{ padding: 14, gap: 10 }}>
        <Row style={{ flexWrap: "nowrap", alignItems: "flex-start" }}>
          <Poster url={card.posterUrl} width={48} />
          <View style={{ flex: 1, gap: 2 }}>
            <Txt variant="label">{`Recipe: ${card.name}`}</Txt>
            <Txt variant="cap">{`by @${card.handle}`}</Txt>
          </View>
        </Row>
        <RecipeHasList has={has} locked />
        <Button label="Make it without the recipe" kind="ghost" onPress={onWithout} style={{ paddingHorizontal: 0, alignSelf: "flex-start" }} />
      </View>
    </View>
  );
}


const styles = StyleSheet.create({
  badge: { position: "absolute", top: 6, left: 6, minHeight: 24, borderRadius: 12, paddingHorizontal: 8, justifyContent: "center" },
  free: { position: "absolute", bottom: 6, left: 6, minHeight: 24, borderRadius: 12, paddingHorizontal: 8, justifyContent: "center" },
  fan: { borderWidth: 2, borderRadius: radius.sm + 2, overflow: "hidden" },
  keep: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44 },
  num: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  lock: { borderWidth: 1, borderRadius: radius.lg, overflow: "hidden" },
  strip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8 },
});
