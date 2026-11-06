import { Pressable, StyleSheet, View } from "react-native";

import type { FamilyRow } from "@/lib/api";
import { kindPill, remixWord } from "@/lib/remixes";
import { useTheme } from "@/theme";
import { FamilyNodeRow } from "./remix-family";
import { Txt } from "./ui";

// Indent stops growing after level 3, so names never squeeze; deeper rows say their level.
const MAX_INDENT = 3;

// The family tree as an outline (design/community/remix-spec.md X8): the original first, each remix
// indented under the song it came from, with a rail on the leading edge (it moves right in Arabic).
export function FamilyTree({ rows, onMore }: { rows: FamilyRow[]; onMore: (row: FamilyRow) => void }) {
  const { colors } = useTheme();
  const parents: FamilyRow[] = [];
  return (
    <View style={{ gap: 6 }} accessibilityRole="list">
      {rows.map((row) => {
        parents[row.level] = row;
        const parent = row.level ? parents[row.level - 1] : undefined;
        const label = row.gone
          ? `No longer available, level ${row.level + 1}`
          : `${row.level ? kindPill(row.kind) : "Original"}${row.handle ? ` by @${row.handle}` : ""}, ${row.title}, level ${row.level + 1}${parent?.title ? `, remix of ${parent.title}` : ""}${row.remixCount ? `, ${remixWord(row.remixCount)}` : ""}${row.current ? ", this song" : ""}`;
        return (
          <View key={row.key} style={{ marginStart: Math.min(row.level, MAX_INDENT) * 20, gap: 6 }}>
            <View style={row.level ? [styles.rail, { borderColor: colors.lineStrong }] : undefined} accessibilityLabel={label} accessible={false}>
              <FamilyNodeRow n={row} size={row.level ? 40 : 56} pill={row.level ? undefined : "Original"} current={row.current} extra={row.level > MAX_INDENT ? `Level ${row.level + 1}` : undefined} />
            </View>
            {row.more > 0 && row.publicId ? (
              <Pressable accessibilityRole="button" accessibilityLabel={`Show ${row.more} more remixes of ${row.title}`} onPress={() => onMore(row)} hitSlop={6} style={[styles.more, { marginStart: row.level ? 12 : 0 }]}>
                <Txt variant="label" color="tealText">{`Show ${row.more} more`}</Txt>
              </Pressable>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  rail: { borderStartWidth: 2, paddingStart: 10 },
  more: { minHeight: 44, justifyContent: "center" },
});
