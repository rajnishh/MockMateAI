import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { Icon, type IconName } from "@/components/icon";
import { Banner, Button, Sheet, Txt } from "@/components/ui";
import { api, type BlockTarget } from "@/lib/api";
import { useTheme } from "@/theme";

export type ReportKind = "song" | "recipe" | "gift" | "duet";

function LinkRow({ icon, label, onPress, busy }: { icon: IconName; label: string; onPress: () => void; busy?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ busy }} disabled={busy} onPress={onPress} hitSlop={8} style={styles.row}>
      <Icon name={icon} size={18} color={colors.inkMuted} />
      <Txt variant="label" color="inkMuted">
        {label}
      </Txt>
    </Pressable>
  );
}

// "Report this …" and "Block @handle" (App Review 1.2), side by side wherever someone else's songs,
// recipes, gifts or Jugalbandis show. Block asks first; Unblock doesn't. `name` is "@handle" or a name.
export function SafetyActions({
  report,
  block,
  onBlockChange,
}: {
  report: { kind: ReportKind; id: string; label: string };
  block?: { target: BlockTarget; name: string; blocked?: boolean };
  onBlockChange?: (blocked: boolean) => void;
}) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<boolean | null>(null);
  const isBlocked = blocked ?? block?.blocked ?? false;

  async function setBlock(on: boolean) {
    if (!block) return;
    setBusy(true);
    setError(null);
    try {
      await (on ? api.block : api.unblock)(block.target);
      setBlocked(on);
      setAsking(false);
      onBlockChange?.(on);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: 4 }}>
      <LinkRow icon="flag" label={report.label} onPress={() => router.push({ pathname: "/listen/report/[id]", params: { id: report.id, kind: report.kind } })} />
      {block ? <LinkRow icon="ban" label={isBlocked ? `Unblock ${block.name}` : `Block ${block.name}`} busy={busy} onPress={() => (isBlocked ? setBlock(false) : setAsking(true))} /> : null}
      {isBlocked && block ? <Txt variant="cap">{`You blocked ${block.name}. You can unblock them in Settings too.`}</Txt> : null}
      {error && !asking ? <Banner kind="error" text={error} /> : null}
      {block ? (
        <Sheet visible={asking} onClose={() => setAsking(false)}>
          <Txt variant="md" accessibilityRole="header">
            {`Block ${block.name}?`}
          </Txt>
          <Txt>{`You won't see their songs, recipes or remixes, and their gifts and Jugalbandi invites won't reach you. They aren't told. You can unblock them in Settings.`}</Txt>
          {error ? <Banner kind="error" text={error} /> : null}
          <Button label={`Block ${block.name}`} kind="danger" block loading={busy} onPress={() => setBlock(true)} />
          <Button label="Cancel" kind="ghost" block onPress={() => setAsking(false)} />
        </Sheet>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44 },
});
