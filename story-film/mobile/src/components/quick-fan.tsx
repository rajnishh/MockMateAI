import * as Haptics from "expo-haptics";
import { type Href, router } from "expo-router";
import { useEffect } from "react";
import { I18nManager, Modal, PixelRatio, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Animated, { FadeIn, ZoomIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { festivalNear, regionNow } from "@/lib/festivals";
import { useSession } from "@/lib/session";
import { fonts, useTheme } from "@/theme";
import { Icon, type IconName } from "./icon";

// The chilli's quick options (design/v3.0/quick-create.md 3, direction A "Arc fan"): five makers thrown on
// an arc above the button, "All makers" in the middle. Hold the chilli to film instead (lib/capture.ts).
const ITEMS: { label: string; icon: IconName; href: Href }[] = [
  { label: "Make a reel", icon: "film", href: "/create?kind=story" },
  { label: "Make my song", icon: "music", href: "/songs/new" },
  { label: "Hum it", icon: "mic", href: "/hum" },
  { label: "Edit my video", icon: "video", href: "/create?kind=edit" },
  { label: "Music video", icon: "sparkle", href: "/songs" },
];

const DISC = 56;
// Arc from 160° to 20°, so the end discs stay clear of the tab bar's edge.
const FROM = 160;
const TO = 20;

// Where the chilli's centre sits above the screen's bottom edge: tab-bar padding + bar padding + half a tab.
export const chilliCentre = (bottomInset: number) => Math.max(bottomInset, 10) + 6 + 26;

export function QuickFan({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { prefs } = useSession();
  // A festival near you (by time zone and the calendar) gets a chip that prefills the story maker.
  const festival = open ? festivalNear(new Date(), regionNow(), prefs?.language) : null;
  const goFestival = () => {
    if (!festival) return;
    onClose();
    router.push({ pathname: "/create", params: { kind: "story", idea: festival.idea, t: String(Date.now()) } });
  };
  const { width } = useWindowDimensions();
  // Large text: a tile panel is easier to read than an arc of crowded labels.
  const panel = PixelRatio.getFontScale() >= 1.35;
  const radius = width < 390 ? 118 : 128;
  const centreY = chilliCentre(insets.bottom);
  // Reading order runs from the start side: left in English, right in Arabic.
  const items = I18nManager.isRTL ? [...ITEMS].reverse() : ITEMS;

  useEffect(() => {
    if (open) Haptics.selectionAsync().catch(() => undefined);
  }, [open]);

  const go = (href: Href | null) => {
    onClose();
    if (href) router.push(href);
    else router.navigate("/create");
  };

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={StyleSheet.absoluteFill} accessibilityViewIsModal>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }]} />
        {panel ? (
          <View style={[styles.panel, { backgroundColor: colors.deep, bottom: centreY + 40 }]}>
            {ITEMS.map((it) => (
              <Pressable key={it.label} accessibilityRole="button" onPress={() => go(it.href)} style={[styles.tile, { backgroundColor: colors.surfaceRaised }]}>
                <Icon name={it.icon} color={colors.action} />
                <Text style={[styles.tileLabel, { color: colors.ink }]}>{it.label}</Text>
              </Pressable>
            ))}
            {festival ? (
              <Pressable accessibilityRole="button" onPress={goFestival} style={[styles.tile, { backgroundColor: colors.surfaceRaised }]}>
                <Icon name="sparkle" color={colors.action} />
                <Text style={[styles.tileLabel, { color: colors.ink }]}>Make a {festival.name} reel</Text>
              </Pressable>
            ) : null}
            <Pressable accessibilityRole="button" onPress={() => go(null)} style={[styles.tile, { backgroundColor: colors.surfaceRaised }]}>
              <Icon name="grid" color={colors.ink} />
              <Text style={[styles.tileLabel, { color: colors.ink }]}>All makers</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {items.map((it, i) => {
              const deg = FROM - ((FROM - TO) * i) / (items.length - 1);
              const rad = (deg * Math.PI) / 180;
              const x = width / 2 + radius * Math.cos(rad);
              const y = centreY + radius * Math.sin(rad);
              return (
                <Animated.View key={it.label} entering={ZoomIn.delay(i * 30).springify().damping(14)} style={[styles.slot, { left: x - 48, bottom: y - DISC / 2 - 22 }]}>
                  <Pressable accessibilityRole="button" accessibilityLabel={it.label} onPress={() => go(it.href)} style={styles.slotPress}>
                    <View style={[styles.disc, { backgroundColor: colors.surfaceRaised, borderColor: colors.action }]}>
                      <Icon name={it.icon} color={colors.action} />
                    </View>
                    <Text numberOfLines={2} maxFontSizeMultiplier={1.6} style={[styles.label, { color: colors.ink, backgroundColor: colors.surfaceOverlay }]}>
                      {it.label}
                    </Text>
                  </Pressable>
                </Animated.View>
              );
            })}
            <Animated.View entering={FadeIn.delay(120)} style={[styles.all, { bottom: centreY + 44 }]}>
              <Pressable accessibilityRole="button" onPress={() => go(null)} style={[styles.allPill, { backgroundColor: colors.deep }]}>
                <Icon name="grid" size={18} color={colors.onDeep} />
                <Text maxFontSizeMultiplier={1.6} style={[styles.allLabel, { color: colors.onDeep }]}>All makers</Text>
              </Pressable>
            </Animated.View>
            {festival ? (
              <Animated.View entering={FadeIn.delay(160)} style={[styles.all, { bottom: centreY + radius + DISC + 34 }]}>
                <Pressable accessibilityRole="button" onPress={goFestival} style={[styles.allPill, { backgroundColor: colors.action }]}>
                  <Icon name="sparkle" size={18} color={colors.onAction} />
                  <Text maxFontSizeMultiplier={1.6} style={[styles.allLabel, { color: colors.onAction }]}>Make a {festival.name} reel</Text>
                </Pressable>
              </Animated.View>
            ) : null}
          </>
        )}
        {/* The chilli turns into Close in the same spot, so the thumb that opened it closes it. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close quick options"
          onPress={onClose}
          style={[styles.close, { bottom: centreY - 25, left: width / 2 - 25, backgroundColor: colors.action }]}>
          <Icon name="close" color={colors.onAction} />
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  slot: { position: "absolute", width: 96, alignItems: "center" },
  slotPress: { alignItems: "center", gap: 6, minWidth: 56, minHeight: 56 },
  disc: { width: DISC, height: DISC, borderRadius: DISC / 2, alignItems: "center", justifyContent: "center", borderWidth: 2 },
  label: { fontFamily: fonts.semibold, fontSize: 12, textAlign: "center", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, overflow: "hidden" },
  all: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  allPill: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, paddingHorizontal: 16, borderRadius: 22 },
  allLabel: { fontFamily: fonts.semibold, fontSize: 14 },
  close: { position: "absolute", width: 50, height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center" },
  panel: { position: "absolute", left: 16, right: 16, borderRadius: 24, padding: 12, flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: { flexBasis: "47%", flexGrow: 1, minHeight: 72, borderRadius: 16, padding: 12, gap: 6, justifyContent: "center" },
  tileLabel: { fontFamily: fonts.semibold, fontSize: 15 },
});
