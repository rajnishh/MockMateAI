import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { Banner, Button, Field, Header, Screen, Txt, Win } from "@/components/ui";
import { api, type ReportReason } from "@/lib/api";
import { REPORT_REASONS } from "@/lib/listen";
import { radius, useTheme } from "@/theme";

// Report a public song (or, with ?kind=recipe, a reel recipe), with the same reasons as the gift
// page's Report. A person reviews each one.
export default function ReportSong() {
  const { id, kind } = useLocalSearchParams<{ id: string; kind?: "recipe" }>();
  const recipe = kind === "recipe";
  const { colors } = useTheme();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (!reason) return;
    setBusy(true);
    setError(null);
    try {
      await (recipe ? api.reportRecipe : api.reportSong)(id, reason, details.trim());
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Header title={recipe ? "Report this recipe" : "Report this song"} back />
      {done ? (
        <>
          <Win text="Thanks. We'll review it within 24 hours." />
          <Button label="Done" block onPress={() => router.back()} />
        </>
      ) : (
        <>
          <View accessibilityRole="radiogroup" style={{ gap: 8 }}>
            {REPORT_REASONS.map((r) => {
              const on = reason === r.value;
              return (
                <Pressable
                  key={r.value}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  onPress={() => setReason(r.value)}
                  style={[styles.reason, { borderColor: on ? colors.action : colors.line, backgroundColor: on ? colors.coralTint : colors.surfaceRaised }]}>
                  <View style={[styles.dot, { borderColor: on ? colors.action : colors.lineStrong }]}>{on ? <View style={[styles.dotIn, { backgroundColor: colors.action }]} /> : null}</View>
                  <Txt variant="label" style={{ flex: 1 }}>
                    {r.label}
                  </Txt>
                </Pressable>
              );
            })}
          </View>
          <Field label="Tell us more (optional)" value={details} onChangeText={setDetails} multiline maxLength={500} />
          {error ? <Banner kind="error" text={error} /> : null}
          <Button label="Send report" block disabled={!reason} loading={busy} onPress={send} />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  reason: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: 14 },
  dot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  dotIn: { width: 10, height: 10, borderRadius: 5 },
});
