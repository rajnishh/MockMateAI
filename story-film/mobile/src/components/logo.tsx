import { useEffect, useState } from "react";
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from "react-native";

// Plain Text, not the UI kit's Txt: the kit's Skeleton uses this file, so importing it back would be a cycle.
import { fonts, useTheme } from "@/theme";

const CYCLE = 2400;
// The reel's holes, as offsets from the reel's top-left in the 112-unit logo grid.
const HOLES = [
  [32, 14],
  [49, 26],
  [43, 46],
  [21, 46],
  [15, 26],
];

// Follows the phone's "reduce motion" setting; the logo then stands still.
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => alive && setReduced(v), () => undefined);
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduced;
}

// The Reelkar reel: the reel turns once, the film tail feeds out and the hub clicks. loop: keep
// playing (loaders, splash). rings: coral and teal rings pulse out (the splash and long waits).
export function ReelLogo({ size = 64, loop = false, rings = false }: { size?: number; loop?: boolean; rings?: boolean }) {
  const { mode, colors } = useTheme();
  const reduced = useReducedMotion();
  const [t] = useState(() => new Animated.Value(0));
  const [r] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (reduced) return;
    const turn = Animated.timing(t, { toValue: 1, duration: CYCLE, easing: Easing.linear, useNativeDriver: true });
    const anim = loop ? Animated.loop(turn) : turn;
    anim.start();
    const pulse = rings ? Animated.loop(Animated.timing(r, { toValue: 1, duration: CYCLE, easing: Easing.out(Easing.quad), useNativeDriver: true })) : null;
    pulse?.start();
    return () => {
      anim.stop();
      pulse?.stop();
    };
  }, [t, r, loop, rings, reduced]);

  const k = size / 112;
  const dark = mode === "dark";
  const tile = dark ? colors.surfaceRaised : colors.brand;
  const reel = dark ? colors.teal : "#ffffff";
  const tail = dark ? colors.pop : colors.teal;
  const spin = t.interpolate({ inputRange: [0, 0.45, 1], outputRange: ["0deg", "360deg", "360deg"], easing: Easing.bezier(0.6, 0, 0.3, 1) });
  const feed = t.interpolate({ inputRange: [0, 0.35, 0.58, 0.68, 1], outputRange: [0.15, 0.15, 1.15, 1, 1] });
  const click = t.interpolate({ inputRange: [0, 0.45, 0.53, 0.62, 1], outputRange: [1, 1, 1.9, 1, 1] });
  // Two rings half a cycle apart, each growing and fading.
  const ring = (offset: number) => {
    const p = offset ? { inputRange: [0, 0.5, 0.5001, 1], scale: [1.325, 1.75, 0.9, 1.325], opacity: [0.4, 0, 0.8, 0.4] } : { inputRange: [0, 1], scale: [0.9, 1.75], opacity: [0.8, 0] };
    return {
      transform: [{ scale: r.interpolate({ inputRange: p.inputRange, outputRange: p.scale }) }],
      opacity: r.interpolate({ inputRange: p.inputRange, outputRange: p.opacity }),
    };
  };

  const mark = (
    <View
      style={[
        { width: size, height: size, borderRadius: 30 * k, backgroundColor: tile },
        dark ? { shadowColor: colors.teal, shadowOpacity: 0.6, shadowRadius: 10 * k, shadowOffset: { width: 0, height: 0 } } : null,
      ]}>
      <Animated.View
        style={{
          position: "absolute",
          left: 56 * k,
          top: 80 * k,
          width: 36 * k,
          height: 8 * k,
          borderRadius: 4 * k,
          backgroundColor: tail,
          transformOrigin: "left",
          transform: [{ scaleX: reduced ? 1 : feed }],
        }}
      />
      <Animated.View style={{ position: "absolute", left: 22 * k, top: 22 * k, width: 64 * k, height: 64 * k, borderRadius: 32 * k, backgroundColor: reel, transform: [{ rotate: reduced ? "0deg" : spin }] }}>
        {HOLES.map(([x, y]) => (
          <View key={`${x}-${y}`} style={{ position: "absolute", left: (x - 6) * k, top: (y - 6) * k, width: 12 * k, height: 12 * k, borderRadius: 6 * k, backgroundColor: tile }} />
        ))}
      </Animated.View>
      <Animated.View style={{ position: "absolute", left: 49 * k, top: 49 * k, width: 10 * k, height: 10 * k, borderRadius: 5 * k, backgroundColor: colors.coral, transform: [{ scale: reduced ? 1 : click }] }} />
    </View>
  );

  if (!rings) return <View accessible accessibilityRole="image" accessibilityLabel="Reelkar">{mark}</View>;
  return (
    <View accessible accessibilityRole="image" accessibilityLabel="Reelkar" style={{ width: size * 1.75, height: size * 1.75, alignItems: "center", justifyContent: "center" }}>
      {reduced
        ? null
        : [colors.coral, colors.teal].map((c, i) => (
            <Animated.View key={c} style={[StyleSheet.absoluteFill, styles.center]}>
              <Animated.View style={[{ width: size, height: size, borderRadius: size / 2, borderWidth: 3, borderColor: c }, ring(i)]} />
            </Animated.View>
          ))}
      {mark}
    </View>
  );
}

// Loading anywhere in the app: the reel spins. Long waits (making a reel) add the rings.
export function LogoLoader({ label, long }: { label?: string; long?: boolean }) {
  const { colors } = useTheme();
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={label ?? "Loading"} style={styles.loader}>
      <ReelLogo size={long ? 72 : 48} loop rings={long} />
      {label ? (
        <Text style={{ fontFamily: fonts.bold, fontSize: 13, color: colors.inkMuted, textAlign: "center" }}>{label}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center" },
  loader: { alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12 },
});
