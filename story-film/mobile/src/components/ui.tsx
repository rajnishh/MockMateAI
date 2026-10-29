import { router, type Href } from "expo-router";
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { fonts, radius, size, space, useTheme, type Colors } from "@/theme";
import { Icon, type IconName } from "./icon";

// Indian and Arabic scripts aren't in Manrope; text containing them uses Hind (or the system Arabic font).
const INDIC = /[ऀ-෿]/;
const ARABIC = /[؀-ۿ]/;

type Variant = "xl" | "lg" | "md" | "body" | "bodyLg" | "label" | "cap" | "over" | "mono";

const TYPE: Record<Variant, TextStyle> = {
  xl: { fontFamily: fonts.extrabold, fontSize: 34, lineHeight: 40, letterSpacing: -0.7 },
  lg: { fontFamily: fonts.extrabold, fontSize: 26, lineHeight: 32, letterSpacing: -0.5 },
  md: { fontFamily: fonts.bold, fontSize: 18, lineHeight: 24 },
  bodyLg: { fontFamily: fonts.regular, fontSize: 17, lineHeight: 28 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 24 },
  label: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 21 },
  cap: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18 },
  over: { fontFamily: fonts.bold, fontSize: 11.5, lineHeight: 16, letterSpacing: 0.9, textTransform: "uppercase" },
  mono: { fontFamily: fonts.mono, fontSize: 13, lineHeight: 18, fontVariant: ["tabular-nums"] },
};

export function Txt({
  variant = "body",
  color,
  style,
  children,
  numberOfLines,
  accessibilityRole,
  selectable,
}: {
  selectable?: boolean;
  accessibilityRole?: "header" | "text";
  variant?: Variant;
  color?: keyof Colors;
  style?: StyleProp<TextStyle>;
  children: ReactNode;
  numberOfLines?: number;
}) {
  const { colors } = useTheme();
  const muted = variant === "cap" || variant === "over";
  const base = TYPE[variant];
  let family = base.fontFamily;
  if (typeof children === "string" && variant !== "mono") {
    if (INDIC.test(children)) family = base.fontFamily === fonts.regular || base.fontFamily === fonts.medium ? fonts.indic : fonts.indicBold;
    else if (ARABIC.test(children)) family = undefined;
  }
  return (
    <Text selectable={selectable} accessibilityRole={accessibilityRole} numberOfLines={numberOfLines} style={[base, { fontFamily: family, color: colors[color ?? (muted ? "inkMuted" : "ink")] }, style]}>
      {children}
    </Text>
  );
}

export function Screen({ children, scroll = true, footer }: { children: ReactNode; scroll?: boolean; footer?: ReactNode }) {
  const { colors } = useTheme();
  const body = <View style={styles.screenBody}>{children}</View>;
  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.surface }}>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {body}
        </ScrollView>
      ) : (
        <View style={[styles.scroll, { flex: 1 }]}>{body}</View>
      )}
      {footer ? <View style={[styles.footer, { backgroundColor: colors.surface }]}>{footer}</View> : null}
    </SafeAreaView>
  );
}

export function Header({ title, sub, back, right }: { title: string; sub?: string; back?: boolean | Href; right?: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={styles.header}>
      {back ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={8}
          onPress={() => (typeof back === "boolean" ? (router.canGoBack() ? router.back() : router.replace("/home")) : router.replace(back))}
          style={styles.backBtn}>
          <Icon name="back" color={colors.ink} />
        </Pressable>
      ) : null}
      <View style={{ flex: 1 }}>
        {sub ? <Txt variant="cap">{sub}</Txt> : null}
        <Txt variant="lg" accessibilityRole="header" numberOfLines={2}>
          {title}
        </Txt>
      </View>
      {right}
    </View>
  );
}

type ButtonKind = "primary" | "secondary" | "tweak" | "ghost" | "danger";

export function Button({
  label,
  onPress,
  kind = "primary",
  icon,
  block,
  small,
  disabled,
  loading,
  style,
}: {
  label: string;
  onPress?: () => void;
  kind?: ButtonKind;
  icon?: IconName;
  block?: boolean;
  small?: boolean;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const off = disabled || loading;
  const look: Record<ButtonKind, { bg: string; fg: string; border: string }> = {
    primary: { bg: colors.action, fg: colors.onAction, border: "transparent" },
    secondary: { bg: "transparent", fg: colors.ink, border: colors.lineStrong },
    tweak: { bg: colors.teal, fg: colors.onTeal, border: "transparent" },
    ghost: { bg: "transparent", fg: colors.tealText, border: "transparent" },
    danger: { bg: "transparent", fg: colors.danger, border: colors.lineStrong },
  };
  const l = off ? { bg: colors.surfaceSunken, fg: colors.inkMuted, border: "transparent" } : look[kind];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy: loading }}
      disabled={off}
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        {
          backgroundColor: l.bg,
          borderColor: l.border,
          minHeight: small ? 40 : size.buttonHeight,
          paddingHorizontal: kind === "ghost" ? space[2] : small ? space[4] : 22,
          alignSelf: block ? "stretch" : "flex-start",
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
        style,
      ]}>
      {loading ? <ActivityIndicator color={l.fg} /> : icon ? <Icon name={icon} size={18} color={l.fg} /> : null}
      <Text style={{ fontFamily: fonts.bold, fontSize: small ? 14 : 16, color: l.fg }}>{label}</Text>
    </Pressable>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.chip,
        { borderColor: selected ? colors.tealText : colors.lineStrong, backgroundColor: selected ? colors.tealTint : colors.surfaceRaised },
      ]}>
      {selected ? <View style={[styles.chipDot, { backgroundColor: colors.tealText }]} /> : null}
      <Txt variant="label" style={{ fontSize: 14 }}>
        {label}
      </Txt>
    </Pressable>
  );
}

export function ChipRow<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.row} accessibilityRole="radiogroup">
      {options.map((o) => (
        <Chip key={o.value} label={o.label} selected={o.value === value} onPress={() => onChange(o.value)} />
      ))}
    </View>
  );
}

export function Card({ children, onPress, flat, style }: { children: ReactNode; onPress?: () => void; flat?: boolean; style?: StyleProp<ViewStyle> }) {
  const { colors, mode } = useTheme();
  const s = [
    styles.card,
    { backgroundColor: colors.surfaceRaised, borderColor: colors.line },
    !flat && (mode === "light" ? styles.shadowLight : styles.shadowDark),
    style,
  ];
  return onPress ? (
    <Pressable accessibilityRole="button" onPress={onPress} style={s}>
      {children}
    </Pressable>
  ) : (
    <View style={s}>{children}</View>
  );
}

export function Hero({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return <View style={[styles.hero, { backgroundColor: colors.brand }]}>{children}</View>;
}

export function Win({ text, icon = "check" }: { text: string; icon?: IconName }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.win, { backgroundColor: colors.coralTint }]}>
      <View style={[styles.winDot, { backgroundColor: colors.coral }]}>
        <Icon name={icon} size={16} color={colors.onCoral} />
      </View>
      <Txt variant="label" style={{ flex: 1, fontSize: 14 }}>
        {text}
      </Txt>
    </View>
  );
}

export function Banner({ kind, title, text, action }: { kind: "info" | "warn" | "error"; title?: string; text: string; action?: ReactNode }) {
  const { colors } = useTheme();
  const bg = kind === "info" ? colors.tealTint : kind === "error" ? colors.coralTint : colors.surfaceSunken;
  return (
    <View
      accessibilityRole={kind === "error" ? "alert" : undefined}
      style={[styles.banner, { backgroundColor: bg }, kind === "warn" && { borderWidth: 1, borderStyle: "dashed", borderColor: colors.warning }]}>
      <Icon name={kind === "info" ? "sparkle" : "alert"} size={18} color={colors.ink} />
      <View style={{ flex: 1, gap: 2 }}>
        {title ? <Txt variant="label">{title}</Txt> : null}
        <Txt variant="cap" color="ink">
          {text}
        </Txt>
      </View>
      {action}
    </View>
  );
}

export function ProgressBar({ value, onBrand }: { value: number; onBrand?: boolean }) {
  const { colors } = useTheme();
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(pct) }}
      style={[styles.bar, { backgroundColor: onBrand ? "rgba(255,255,255,0.18)" : colors.surfaceSunken }]}>
      <View style={{ width: `${pct}%`, height: "100%", borderRadius: 99, backgroundColor: onBrand ? colors.teal : colors.tealText }} />
    </View>
  );
}

export function Status({ kind, text }: { kind: "ok" | "warn" | "error" | "making"; text: string }) {
  const { colors } = useTheme();
  const c = { ok: colors.success, warn: colors.warning, error: colors.danger, making: colors.tealText }[kind];
  const icon: IconName = kind === "ok" ? "check" : kind === "making" ? "sparkle" : "alert";
  return (
    <View style={styles.status}>
      <Icon name={icon} size={16} color={c} />
      <Text style={{ fontFamily: fonts.bold, fontSize: 13, color: c }}>{text}</Text>
    </View>
  );
}

export function CheckRow({ label, sub, done, action }: { label: string; sub?: string; done: boolean; action?: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.lrow, { borderTopColor: colors.line }]} accessibilityRole="checkbox" accessibilityState={{ checked: done }}>
      <View style={[styles.chk, { borderColor: done ? colors.success : colors.lineStrong, backgroundColor: done ? colors.success : "transparent" }]}>
        {done ? <Icon name="check" size={16} color={colors.surfaceRaised} /> : null}
      </View>
      <View style={{ flex: 1 }}>
        <Txt variant="label" color={done ? "inkMuted" : "ink"} style={done ? { textDecorationLine: "line-through" } : undefined}>
          {label}
        </Txt>
        {sub ? <Txt variant="cap">{sub}</Txt> : null}
      </View>
      {action}
    </View>
  );
}

export function ListRow({ icon, title, sub, onPress, right }: { icon?: IconName; title: string; sub?: string; onPress?: () => void; right?: ReactNode }) {
  const { colors } = useTheme();
  return (
    <Pressable accessibilityRole={onPress ? "button" : undefined} disabled={!onPress} onPress={onPress} style={[styles.lrow, { borderTopColor: colors.line }]}>
      {icon ? <Icon name={icon} color={colors.tealText} /> : null}
      <View style={{ flex: 1 }}>
        <Txt variant="label">{title}</Txt>
        {sub ? <Txt variant="cap">{sub}</Txt> : null}
      </View>
      {right ?? (onPress ? <Icon name="right" size={18} color={colors.inkMuted} /> : null)}
    </Pressable>
  );
}

export function Field({ label, ...props }: { label: string } & TextInputProps) {
  const { colors } = useTheme();
  const text = typeof props.value === "string" ? props.value : "";
  return (
    <View style={{ gap: 6 }}>
      <Txt variant="cap" style={{ fontFamily: fonts.bold }}>
        {label}
      </Txt>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.inkMuted}
        {...props}
        style={[
          styles.input,
          {
            borderColor: colors.lineStrong,
            backgroundColor: colors.surfaceSunken,
            color: colors.ink,
            fontFamily: INDIC.test(text) ? fonts.indic : fonts.regular,
            minHeight: props.multiline ? 120 : 50,
            textAlignVertical: props.multiline ? "top" : "center",
          },
          props.style,
        ]}
      />
    </View>
  );
}

export function Credits({ count, onPress }: { count: number | null; onPress?: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${count ?? 0} credits`} onPress={onPress ?? (() => router.push("/credits"))} style={styles.credits} hitSlop={8}>
      <Icon name="sparkle" size={18} color={colors.tealText} />
      <Text style={{ fontFamily: fonts.extrabold, fontSize: 14, color: colors.tealText, fontVariant: ["tabular-nums"] }}>{count ?? "–"}</Text>
    </Pressable>
  );
}

export function Empty({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyArt, { backgroundColor: colors.tealTint }]}>
        <View style={[styles.emptyReel, { backgroundColor: colors.surfaceRaised }]}>
          <View style={[styles.emptyHub, { backgroundColor: colors.coral }]} />
        </View>
      </View>
      <Txt variant="md" style={{ textAlign: "center" }}>
        {title}
      </Txt>
      <Txt variant="cap" style={{ textAlign: "center", maxWidth: 300 }}>
        {text}
      </Txt>
      {action}
    </View>
  );
}

export function Skeleton({ height = 64 }: { height?: number }) {
  const { colors } = useTheme();
  return <View style={{ height, borderRadius: radius.md, backgroundColor: colors.surfaceSunken }} />;
}

export function Row({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: space[4], paddingBottom: space[6] },
  screenBody: { gap: space[4], paddingTop: space[2], width: "100%", maxWidth: 720, alignSelf: "center" },
  footer: { paddingHorizontal: space[4], paddingVertical: space[3], gap: space[2] },
  header: { flexDirection: "row", alignItems: "center", gap: space[2], minHeight: 48 },
  backBtn: { width: 44, height: 44, marginLeft: -10, alignItems: "center", justifyContent: "center" },
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space[2], borderRadius: radius.pill, borderWidth: 2 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 38, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1 },
  chipDot: { width: 7, height: 7, borderRadius: 4 },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space[2] },
  card: { borderRadius: 14, borderWidth: 1, padding: space[4], gap: space[3] },
  shadowLight: { shadowColor: "#111827", shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  shadowDark: { shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 3 },
  hero: { borderRadius: radius.lg, padding: 18, gap: 10 },
  win: { flexDirection: "row", alignItems: "center", gap: space[3], borderRadius: 14, paddingVertical: space[3], paddingHorizontal: 14 },
  winDot: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  banner: { flexDirection: "row", alignItems: "flex-start", gap: 10, borderRadius: radius.md, padding: 14 },
  bar: { height: 8, borderRadius: 99, overflow: "hidden" },
  status: { flexDirection: "row", alignItems: "center", gap: 5 },
  lrow: { flexDirection: "row", alignItems: "center", gap: space[3], paddingVertical: space[3], borderTopWidth: StyleSheet.hairlineWidth },
  chk: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: space[3], fontSize: 16, lineHeight: 26 },
  credits: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 44, paddingHorizontal: 4 },
  empty: { alignItems: "center", gap: space[3], paddingVertical: 36, paddingHorizontal: space[3] },
  emptyArt: { width: 96, height: 96, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  emptyReel: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  emptyHub: { width: 10, height: 10, borderRadius: 5 },
});
