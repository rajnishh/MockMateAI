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
  const list = (films.data ?? []).filter((f) =>
    filter === "all" ? true : filter === "ready" ? f.status === "completed" : filter === "failed" ? f.status === "failed" : f.status === "queued" || f.status === "running" || f.status === "review",
  );
  return (
    <Screen>
      <Header title="My reels" back right={<Button label="New" small icon="plus" onPress={() => router.push("/create")} />} />
      <ChipRow<Filter>
        options={[
          { value: "all", label: "All" },
          { value: "ready", label: "Ready" },
          { value: "making", label: "Making" },
          { value: "failed", label: "Failed" },
        ]}
        value={filter}
        onChange={setFilter}
      />
      {films.loading && !films.data ? (
        <Skeleton height={300} />
      ) : list.length === 0 ? (
        <Empty title="Nothing here yet" text="Reels you make show up here." action={<Button label="Make a reel" icon="sparkle" onPress={() => router.push("/create")} />} />
      ) : (
        <ReelGrid films={list} />
      )}
    </Screen>
  );
}
