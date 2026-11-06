import { router } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";

import type { FamilyNode, OwnRemixOf, Song, SongFamily } from "@/lib/api";
import { plays } from "@/lib/listen";
import { kindPill, remixWord } from "@/lib/remixes";
import { radius, useTheme } from "@/theme";
import { Icon } from "./icon";
import { SongCover } from "./song-cover";
import { Button, Card, Txt } from "./ui";

// A family node as a Song, for SongCover.
export function nodeSong(n: FamilyNode): Song {
  return { id: n.publicId ?? "gone", publicId: n.publicId ?? undefined, handle: n.handle ?? undefined, title: n.title ?? "", genre: "", mood: "", language: "", lyrics: "", durationSec: 0, status: "completed", myVoice: false, edited: false, contentCredentials: false, error: null, createdAt: "", audioUrl: null, coverUrl: n.coverUrl };
}

export function KindPill({ text, on }: { text: string; on?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.pill, { backgroundColor: on ? "transparent" : colors.surfaceSunken, borderColor: on ? colors.tealText : "transparent" }]}>
      <Txt variant="cap" color={on ? "tealText" : "ink"}>
        {text}
      </Txt>
    </View>
  );
}

// One song in a chain: cover, title, @handle, kind pill. A gone node is a grey dashed card you can't tap.
export function FamilyNodeRow({ n, size = 40, pill, current, extra }: { n: FamilyNode; size?: number; pill?: string; current?: boolean; extra?: string }) {
  const { colors } = useTheme();
  if (n.gone) {
    return (
      <View style={[styles.row, styles.gone, { borderColor: colors.lineStrong }]} accessibilityLabel="No longer available. Removed or made private.">
        <View style={{ flex: 1 }}>
          <Txt variant="label" color="inkMuted">
            No longer available
          </Txt>
          <Txt variant="cap">Removed or made private</Txt>
        </View>
      </View>
    );
  }
  const label = pill ?? kindPill(n.kind);
  const sub = [`⁨@${n.handle}⁩`, n.playCount ? plays(n.playCount) : null, n.remixCount ? remixWord(n.remixCount) : null, extra].filter(Boolean).join(" · ");
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${label === "Original" ? "Original" : label} by @${n.handle}, ${n.title}${current ? ", this song" : ""}${n.remixCount ? `, ${remixWord(n.remixCount)}` : ""}`}
      onPress={() => (current ? undefined : router.push({ pathname: "/s/[id]", params: { id: n.publicId! } }))}
      style={[styles.row, { backgroundColor: current ? colors.tealTint : colors.surfaceRaised, borderColor: current ? colors.tealText : colors.line }]}>
      <SongCover song={nodeSong(n)} size={size} radius={10} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="label" numberOfLines={2}>
          {n.title!}
        </Txt>
        <Txt variant="cap">{sub}</Txt>
      </View>
      <KindPill text={current ? "This song" : label} on={current} />
    </Pressable>
  );
}

// The song page's Remixes section (design/community/remix-spec.md X1): where it came from, the top
// remixes, and the family tree. After Lyrics, before More like this.
export function RemixFamily({ family, publicId, title, handle, canRemix, onRemix }: { family: SongFamily; publicId: string; title: string; handle: string; canRemix: boolean; onRemix: () => void }) {
  const { colors } = useTheme();
  const path = family.path;
  return (
    <Card flat>
      <Txt variant="md" accessibilityRole="header">
        Remixes
      </Txt>
      {path.length ? (
        <View style={{ gap: 6 }} accessibilityLabel={`Where it came from: ${path.map((n) => (n.gone ? "No longer available" : `${kindPill(n.kind)}, ${n.title} by @${n.handle}`)).join("; ")}; this song.`}>
          <Txt variant="cap" style={{ fontWeight: "700" }}>
            Where it came from
          </Txt>
          {path.map((n, i) => (
            <View key={`${n.publicId ?? "gone"}-${i}`} style={{ gap: 6 }}>
              <FamilyNodeRow n={n} />
              {i === 0 && family.more ? (
                <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/s/[id]/family", params: { id: publicId } })} style={styles.more}>
                  <Txt variant="label" color="tealText">{`${family.more} more`}</Txt>
                </Pressable>
              ) : null}
            </View>
          ))}
          <View style={[styles.row, { backgroundColor: colors.tealTint, borderColor: colors.tealText }]}>
            <View style={{ flex: 1 }}>
              <Txt variant="label">{title}</Txt>
              <Txt variant="cap">{`⁨@${handle}⁩`}</Txt>
            </View>
            <KindPill text="This song" on />
          </View>
        </View>
      ) : null}

      <Txt variant="cap" style={{ fontWeight: "700" }}>{`Remixes of this song · ${family.remixCount}`}</Txt>
      {!family.allowRemix ? <Txt variant="cap">{`@${handle} has turned off new remixes.`}</Txt> : null}
      {family.top.length ? (
        <View style={{ gap: 6 }}>
          {family.top.map((n) => (
            <FamilyNodeRow key={n.publicId!} n={n} size={48} />
          ))}
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          <Txt>No remixes yet. Be the first.</Txt>
          {canRemix ? <Button label="Remix" icon="music" kind="secondary" small onPress={onRemix} /> : null}
        </View>
      )}
      {family.familySize > 1 ? (
        <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/s/[id]/family", params: { id: publicId } })} style={styles.treeLink}>
          <Txt variant="label" color="tealText" style={{ flex: 1 }}>{`See the family tree · ${family.familySize} songs`}</Txt>
          <Icon name="right" size={18} color={colors.tealText} />
        </Pressable>
      ) : null}
    </Card>
  );
}

// The credit line a remix carries, locked (X6, X7): it stays on the song and can't be removed.
export function RemixCredit({ remixOf }: { remixOf: OwnRemixOf }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.row, { borderColor: colors.line, backgroundColor: colors.surfaceSunken }]} accessible accessibilityLabel={remixOf.gone ? "Credit: a remix of a song that's no longer public. This stays on your song." : `Credit: a remix of ${remixOf.title} by @${remixOf.handle}. This stays on your song.`}>
      <Icon name="lock" size={20} color={colors.inkMuted} />
      <View style={{ flex: 1 }}>
        <Txt variant="label">{remixOf.gone ? "Credit: A remix of a song that's no longer public" : `Credit: A remix of “${remixOf.title}” by ⁨@${remixOf.handle}⁩`}</Txt>
        <Txt variant="cap">This stays on your song.</Txt>
      </View>
    </View>
  );
}

// "How earning works" (X15), shared with the Earnings screen. The share comes from the server.
export function HowEarning({ rate }: { rate: string }) {
  return (
    <>
      <Txt variant="md" accessibilityRole="header">
        How earning works
      </Txt>
      <Txt>{`When someone remixes your public song, or makes a reel with your recipe, you get ${rate} of the credits they paid for.`}</Txt>
      <Txt>Free credits, like your welcome credits, don&apos;t count.</Txt>
      <Txt>You earn when their remix or reel is made. If it fails, they get their credits back and nothing is earned.</Txt>
      <Txt>You never earn from your own songs or recipes.</Txt>
      <Txt>Small amounts add up: every 1.0 goes into your balance.</Txt>
      <Txt>Earned credits can&apos;t be cashed out yet.</Txt>
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.md, borderWidth: 1 },
  gone: { borderStyle: "dashed", borderWidth: 2, backgroundColor: "transparent" },
  pill: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 2, borderWidth: 1 },
  more: { minHeight: 44, justifyContent: "center", alignItems: "center" },
  treeLink: { flexDirection: "row", alignItems: "center", minHeight: 48, gap: 8 },
});
