import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";

import { Banner, Button, Card, Header, ListRow, Screen, Skeleton, Txt } from "@/components/ui";
import { api, type EarningEvent } from "@/lib/api";
import { KIND_PILL, plusAmount } from "@/lib/remixes";
import { useData } from "@/lib/use-data";

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });

// One song's or recipe's earnings (X14), newest first: who remixed it (named only when their remix
// is public; people who used a recipe stay "Someone"), when, and what it earned. Uses paid with free
// credits say so instead of "0".
export default function EarningDetail() {
  const { ref } = useLocalSearchParams<{ ref: string }>();
  const page = useData(() => api.earningDetail(ref));
  const [more, setMore] = useState<EarningEvent[]>([]);
  const [cursor, setCursor] = useState<string | null | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const events = [...(page.data?.events ?? []), ...more];
  const next = cursor === undefined ? page.data?.cursor : cursor;
  const recipe = page.data?.source === "recipe";

  async function loadMore() {
    if (!next) return;
    setLoading(true);
    try {
      const d = await api.earningDetail(ref, next);
      setMore((m) => [...m, ...d.events]);
      setCursor(d.cursor);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <Header title={page.data?.title ?? "Earnings"} back />
      {page.error ? <Banner kind="error" text={page.error} action={<Button label="Try again" small kind="secondary" onPress={page.reload} />} /> : null}
      {!page.data && !page.error ? <Skeleton height={200} /> : null}
      {page.data ? (
        <Card>
          {events.map((e, i) => {
            const what = recipe ? "Someone made a reel" : e.remixerHandle ? `${KIND_PILL[e.kind ?? "cover"] ?? "Remix"} by @${e.remixerHandle}` : "A private remix";
            return (
              <ListRow
                key={`${e.at}-${i}`}
                title={what}
                sub={e.free ? `${day(e.at)} · Free credits, nothing earned` : day(e.at)}
                right={e.free ? null : <Txt variant="label">{plusAmount(e.hundredths)}</Txt>}
                onPress={!recipe && e.publicId ? () => router.push({ pathname: "/s/[id]", params: { id: e.publicId! } }) : undefined}
              />
            );
          })}
          {!events.length ? <Txt variant="cap">{recipe ? "Nothing earned from this recipe yet." : "Nothing earned from this song yet."}</Txt> : null}
        </Card>
      ) : null}
      {next ? <Button label="Load more" kind="secondary" block loading={loading} onPress={loadMore} /> : null}
    </Screen>
  );
}
