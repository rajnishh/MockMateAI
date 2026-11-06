import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";

import { RecipeTile } from "@/components/recipes";
import { Banner, Button, ChipRow, Empty, Header, Screen, Skeleton, Txt } from "@/components/ui";
import { api, type RecipeCard, type RecipeFormat } from "@/lib/api";
import { useData } from "@/lib/use-data";

type Format = RecipeFormat | "all";
const FORMATS: { value: Format; label: string }[] = [
  { value: "all", label: "All" },
  { value: "story", label: "Story" },
  { value: "motion", label: "Motion" },
  { value: "dance", label: "Kids dance" },
  { value: "edit", label: "Edit my video" },
];

// One festival collection (C3), or a maker's recipes (slug "all" with ?maker=): the featured picks
// first, then a 2-column grid by uses this week.
export default function Collection() {
  const { slug, maker } = useLocalSearchParams<{ slug: string; maker?: string }>();
  const [format, setFormat] = useState<Format>("all");
  const f = format === "all" ? undefined : format;
  const data = useData(async () =>
    maker ? { festival: null, featured: [] as RecipeCard[], recipes: (await api.recipeList({ maker, ...(f ? { format: f } : {}) })).recipes } : await api.recipeCollection(slug, "en", f),
  );
  const { reload } = data;
  useEffect(() => {
    reload();
  }, [format, reload]);
  const d = data.data;
  const name = maker ? `@${maker}` : (d?.festival?.name ?? "Recipes");
  const date = d?.festival?.date ? new Date(`${d.festival.date}T00:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "long", timeZone: "UTC" }) : null;

  return (
    <Screen>
      <Header title={name} sub={d?.festival ? [date, `${d.festival.count} recipes`].filter(Boolean).join(" · ") : undefined} back />
      <ChipRow<Format> options={FORMATS} value={format} onChange={setFormat} />
      {data.error ? <Banner kind="error" text={data.error} action={<Button label="Try again" small kind="secondary" onPress={reload} />} /> : null}
      {!d ? (
        data.error ? null : <Skeleton height={300} />
      ) : !d.featured.length && !d.recipes.length ? (
        <Empty
          title={`No ${name} recipes yet`}
          text={`Make a ${name} reel and share it as a recipe. You'd be the first.`}
          action={<Button label="Make a reel" kind="secondary" onPress={() => router.push("/create")} />}
        />
      ) : (
        <>
          {d.featured.length ? (
            <>
              <Txt variant="over">Picked by Reelkar</Txt>
              <Grid cards={d.featured} />
            </>
          ) : null}
          <Grid cards={d.recipes} />
        </>
      )}
    </Screen>
  );
}

function Grid({ cards }: { cards: RecipeCard[] }) {
  const [width, setWidth] = useState(0);
  const tile = Math.floor((width - 12) / 2);
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
      {tile > 0 ? cards.map((c, i) => <RecipeTile key={c.publicId} card={c} width={tile} seed={i} />) : null}
    </View>
  );
}
