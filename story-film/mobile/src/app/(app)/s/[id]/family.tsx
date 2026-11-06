import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";

import { FamilyTree } from "@/components/family-tree";
import { Banner, Button, ChipRow, Empty, Header, Screen, Skeleton } from "@/components/ui";
import { api, type FamilySort } from "@/lib/api";
import { useData } from "@/lib/use-data";

// A song's family tree: where it came from and every public remix, Top or Newest.
export default function FamilyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [sort, setSort] = useState<FamilySort>("top");
  const [branch, setBranch] = useState<string | undefined>(undefined);
  const tree = useData(() => api.familyTree(id, sort, branch));
  const { reload } = tree;
  const t = tree.data;
  // A new sort, or "Show more" on a branch, loads the tree again.
  useEffect(() => {
    reload();
  }, [sort, branch, reload]);

  return (
    <Screen>
      <Header title="Family tree" sub={t ? `${t.rootTitle ?? "No longer available"} · ${t.size} ${t.size === 1 ? "song" : "songs"}` : undefined} back />
      <ChipRow<FamilySort>
        options={[
          { value: "top", label: "Top" },
          { value: "new", label: "Newest" },
        ]}
        value={sort}
        onChange={(v) => {
          setSort(v);
          setBranch(undefined);
        }}
      />
      {tree.error ? <Banner kind="error" text="Couldn't load the family tree." action={<Button label="Try again" small kind="secondary" onPress={tree.reload} />} /> : null}
      {!t && !tree.error ? <Skeleton height={320} /> : null}
      {t ? t.rows.length <= 1 ? <Empty title="No remixes yet." text="When people remix this song, they show here." /> : <FamilyTree rows={t.rows} onMore={(row) => setBranch(row.publicId ?? undefined)} /> : null}
    </Screen>
  );
}
