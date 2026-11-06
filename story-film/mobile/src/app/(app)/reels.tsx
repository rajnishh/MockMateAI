import { router } from "expo-router";
import { useState } from "react";

import { ReelGrid } from "@/components/reel-grid";
import { Button, ChipRow, Empty, Header, Screen, Skeleton } from "@/components/ui";
import { api } from "@/lib/api";
import { useData } from "@/lib/use-data";

type Filter = "all" | "ready" | "making" | "failed";

export default function Reels() {
  const films = useData(() => api.films());
  const [filter, setFilter] = useState<Filter>("all");
  const all = films.data ?? [];
  const failedCount = all.filter((f) => f.status === "failed").length;
  // Failed reels stay out of All; the Failed chip shows them, to try again or delete.
  // After the last failed reel is deleted its chip goes, so fall back to All.
  const shown: Filter = filter === "failed" && !failedCount ? "all" : filter;
  const list = all.filter((f) =>
    shown === "all" ? f.status !== "failed" : shown === "ready" ? f.status === "completed" : shown === "failed" ? f.status === "failed" : f.status === "queued" || f.status === "running" || f.status === "review",
  );
  return (
    <Screen>
      <Header title="My reels" back right={<Button label="New" small icon="plus" onPress={() => router.push("/create")} />} />
      <ChipRow<Filter>
        options={[
          { value: "all", label: "All" },
          { value: "ready", label: "Ready" },
          { value: "making", label: "Making" },
          ...(failedCount ? [{ value: "failed" as const, label: `Failed (${failedCount})` }] : []),
        ]}
        value={shown}
        onChange={setFilter}
      />
      {films.loading && !films.data ? (
        <Skeleton height={300} />
      ) : list.length === 0 ? (
        <Empty title="Nothing here yet" text="Reels you make show up here." action={<Button label="Make a reel" icon="sparkle" onPress={() => router.push("/create")} />} />
      ) : (
        <ReelGrid films={list} onDeleted={films.reload} />
      )}
    </Screen>
  );
}
