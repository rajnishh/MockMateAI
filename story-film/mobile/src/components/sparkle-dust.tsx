import { useIsFocused } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { AppState, StyleSheet, View } from "react-native";
import Animated, { type SharedValue, useAnimatedStyle, useFrameCallback, useReducedMotion, useSharedValue } from "react-native-reanimated";
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop, Circle } from "react-native-svg";

import type { SongAnalysis } from "@/lib/api";
import type { ParticleKind, PlayerTheme } from "@/lib/player-themes";

const ENVELOPE_RATE = 20;

export interface BeatDrive {
  // Smoothed loudness 0..1, a beat's hit 0..1 that fades in about 150 ms, distance travelled, and seconds on screen.
  energy: SharedValue<number>;
  pulse: SharedValue<number>;
  travel: SharedValue<number>;
  clock: SharedValue<number>;
  moving: boolean;
}

// Turns the song's position into beat and loudness values on the UI thread, every frame, while the
// song plays and this screen is showing. Nothing runs when paused, hidden or with Reduce Motion on.
export function useBeatDrive(analysis: SongAnalysis | null, at: { time: number; playing: boolean }): BeatDrive {
  const reduce = useReducedMotion();
  const focused = useIsFocused();
  const [foreground, setForeground] = useState(AppState.currentState === "active");
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => setForeground(s === "active"));
    return () => sub.remove();
  }, []);

  const envelope = useSharedValue<number[]>([]);
  const beats = useSharedValue<number[]>([]);
  const strength = useSharedValue<number[]>([]);
  const beatIdx = useSharedValue(-1);
  const anchorT = useSharedValue(0);
  const anchorAt = useSharedValue(0);
  const energy = useSharedValue(0);
  const pulse = useSharedValue(0);
  const travel = useSharedValue(0);
  const clock = useSharedValue(0);

  useEffect(() => {
    envelope.set(analysis?.envelope ?? []);
    beats.set(analysis?.beats ?? []);
    strength.set(analysis?.strength ?? []);
    beatIdx.set(-1);
  }, [analysis, envelope, beats, strength, beatIdx]);

  // The player reports its time a few times a second; frames in between count on from there.
  useEffect(() => {
    anchorT.set(at.time);
    anchorAt.set(Date.now());
  }, [at.time, at.playing, anchorT, anchorAt]);

  const frame = useFrameCallback((f) => {
    "worklet";
    const dt = Math.min(0.05, (f.timeSincePreviousFrame ?? 16) / 1000);
    const t = anchorT.value + (Date.now() - anchorAt.value) / 1000;
    const env = envelope.value;
    let loud = 0.55;
    if (env.length) {
      const x = t * ENVELOPE_RATE;
      const i = Math.floor(x);
      loud = i >= 0 && i < env.length ? env[i] + ((env[i + 1] ?? env[i]) - env[i]) * (x - i) : 0;
    }
    const b = beats.value;
    let hit = 0;
    if (b.length) {
      let i = beatIdx.value;
      if (i >= b.length || (i >= 0 && b[i] > t + 0.05)) i = -1;
      while (i + 1 < b.length && b[i + 1] <= t) i++;
      beatIdx.set(i);
      if (i >= 0) hit = (strength.value[i] ?? 1) * Math.exp(-(t - b[i]) * 7);
    } else if (!env.length) {
      // No analysis yet: a gentle 96 BPM pulse.
      hit = 0.6 * Math.exp(-((t * 1.6) % 1) * 5);
    }
    energy.set(energy.value + (loud - energy.value) * Math.min(1, dt * 10));
    pulse.set(hit);
    travel.set(travel.value + dt * (0.18 + energy.value * 0.9 + hit * 1.6));
    clock.set(clock.value + dt);
  }, false);

  const moving = !reduce && focused && foreground && at.playing;
  useEffect(() => {
    frame.setActive(moving);
  }, [frame, moving]);

  return { energy, pulse, travel, clock, moving };
}

// The fractional part, for wrapping particles around the screen. A named worklet, so the React
// Compiler doesn't hoist it out of the UI-thread style function.
function frac(v: number): number {
  "worklet";
  return v - Math.floor(v);
}

// Repeatable random numbers per particle, so nothing is stored per frame.
function seeded(i: number, k: number): number {
  const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

interface Seed {
  x0: number;
  y0: number;
  speed: number;
  phase: number;
  burst: number;
  size: number;
  spin: number;
  color: string;
}

// Background, glow and sparkle dust for a player theme. The dust swells and bursts out on each beat.
export function PlayerBackdrop({ theme, drive, width, height, focusY }: { theme: PlayerTheme; drive: BeatDrive; width: number; height: number; focusY: number }) {
  const reduce = useReducedMotion();
  const seeds = useMemo<Seed[]>(
    () =>
      Array.from({ length: theme.count }, (_, i) => ({
        x0: seeded(i, 1),
        y0: seeded(i, 2),
        speed: 0.35 + seeded(i, 3) * 0.9,
        phase: seeded(i, 4) * Math.PI * 2,
        burst: 0.4 + seeded(i, 5) * 1.2,
        size: theme.kind === "rain" ? 1 + seeded(i, 6) : 1.6 + seeded(i, 6) * 3.4,
        spin: 40 + seeded(i, 7) * 120,
        color: theme.particles[i % theme.particles.length],
      })),
    [theme],
  );
  const glow = Math.min(width, height) * 0.95;
  const aura = useAnimatedStyle(() => ({
    opacity: reduce ? 0.45 : 0.3 + drive.energy.value * 0.4 + drive.pulse.value * 0.25,
    transform: [{ scale: reduce ? 1 : 1 + drive.energy.value * 0.12 + drive.pulse.value * 0.14 }],
  }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id={`sky-${theme.id}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={theme.sky[0]} />
            <Stop offset="0.55" stopColor={theme.sky[1]} />
            <Stop offset="1" stopColor={theme.sky[2]} />
          </LinearGradient>
        </Defs>
        <Rect width={width} height={height} fill={`url(#sky-${theme.id})`} />
      </Svg>
      <Animated.View style={[{ position: "absolute", left: width / 2 - glow / 2, top: focusY - glow / 2, width: glow, height: glow }, aura]}>
        <Svg width={glow} height={glow}>
          <Defs>
            <RadialGradient id={`aura-${theme.id}`} cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={theme.glow} stopOpacity="0.85" />
              <Stop offset="0.45" stopColor={theme.glow} stopOpacity="0.28" />
              <Stop offset="1" stopColor={theme.glow} stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Circle cx={glow / 2} cy={glow / 2} r={glow / 2} fill={`url(#aura-${theme.id})`} />
        </Svg>
      </Animated.View>
      {reduce || width === 0 ? null : seeds.map((s, i) => <Particle key={`${theme.id}-${i}`} seed={s} kind={theme.kind} drive={drive} width={width} height={height} focusY={focusY} />)}
    </View>
  );
}

function Particle({ seed, kind, drive, width: w, height: h, focusY }: { seed: Seed; kind: ParticleKind; drive: BeatDrive; width: number; height: number; focusY: number }) {
  const { x0, y0, speed, phase, burst, size, spin } = seed;
  const style = useAnimatedStyle(() => {
    const travel = drive.travel.value;
    const clock = drive.clock.value;
    const pulse = drive.pulse.value;
    const energy = drive.energy.value;
    let x = 0;
    let y = 0;
    let rotate = 0;
    let fade = 1;
    if (kind === "rise") {
      y = h + 20 - frac(y0 + travel * speed * 0.35) * (h + 40);
      x = x0 * w + Math.sin(clock * 0.6 + phase) * 14;
    } else if (kind === "rain") {
      y = -30 + frac(y0 + travel * speed * 1.1) * (h + 60);
      x = frac(x0 + 0.3 - (y / w) * 0.25) * w;
      rotate = 14;
    } else if (kind === "radiate") {
      const d = frac(y0 + travel * speed * 0.3);
      const r = d * Math.hypot(w, h) * 0.55;
      const a = x0 * Math.PI * 2 + clock * 0.05 * (phase > Math.PI ? 1 : -1);
      x = w / 2 + Math.cos(a) * r;
      y = focusY + Math.sin(a) * r;
      fade = Math.min(1, d * 5);
    } else {
      y = -20 + frac(y0 + travel * speed * 0.25) * (h + 40);
      x = x0 * w + Math.sin(clock * 0.8 + phase) * 24;
      rotate = clock * spin + y0 * 360;
    }
    // On the beat, everything bursts away from the cover a little.
    x += (x - w / 2) * pulse * burst * 0.16;
    y += (y - focusY) * pulse * burst * 0.16;
    const twinkle = 0.25 + 0.55 * Math.abs(Math.sin(clock * (1.2 + burst) + phase));
    return {
      opacity: Math.min(1, (twinkle + pulse * 0.35) * fade),
      transform: [{ translateX: x }, { translateY: y }, { rotate: `${rotate}deg` }, { scale: 1 + pulse * (0.7 + burst * 0.6) + energy * 0.35 }],
    };
  });

  const c = seed.color;
  if (kind === "rain") {
    return <Animated.View style={[styles.p, { width: size, height: 10 + size * 9, borderRadius: size, backgroundColor: c }, style]} />;
  }
  const d = size * 2;
  // Two faint rings around the dot read as a soft glow without per-frame shadows.
  const outer = d * 2.8;
  const inner = d * 1.7;
  return (
    <Animated.View style={[styles.p, { width: d, height: d }, style]}>
      <View style={{ position: "absolute", left: (d - outer) / 2, top: (d - outer) / 2, width: outer, height: outer, borderRadius: outer / 2, backgroundColor: c, opacity: 0.07 }} />
      <View style={{ position: "absolute", left: (d - inner) / 2, top: (d - inner) / 2, width: inner, height: inner, borderRadius: inner / 2, backgroundColor: c, opacity: 0.16 }} />
      <View style={{ width: d, height: d, borderRadius: kind === "tumble" ? 1.5 : d / 2, backgroundColor: c, transform: kind === "tumble" ? [{ rotate: "45deg" }] : undefined }} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  p: { position: "absolute", left: 0, top: 0 },
});
