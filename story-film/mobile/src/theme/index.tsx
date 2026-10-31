import { createContext, type ReactNode, useContext, useMemo, useState } from "react";
import { useColorScheme } from "react-native";

import { palette, radius, size, space } from "./tokens";

export { palette, radius, size, space };

export type Mode = "light" | "dark";
export type Colors = { [K in keyof typeof palette.light]: string };

export const fonts = {
  regular: "PlusJakartaSans_400Regular",
  medium: "PlusJakartaSans_500Medium",
  semibold: "PlusJakartaSans_600SemiBold",
  bold: "PlusJakartaSans_700Bold",
  extrabold: "PlusJakartaSans_800ExtraBold",
  // Indian scripts: Plus Jakarta Sans has no Devanagari, so text typed by people uses Hind.
  indic: "Hind_400Regular",
  indicBold: "Hind_600SemiBold",
  mono: "JetBrainsMono_500Medium",
} as const;

interface ThemeValue {
  mode: Mode;
  colors: Colors;
  // "system" follows the phone; the person can pin light or dark in Account.
  preference: Mode | "system";
  setPreference: (p: Mode | "system") => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [preference, setPreference] = useState<Mode | "system">("system");
  const mode: Mode = preference === "system" ? (system === "dark" ? "dark" : "light") : preference;
  const value = useMemo(() => ({ mode, colors: palette[mode], preference, setPreference }), [mode, preference]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const t = useContext(ThemeContext);
  if (!t) throw new Error("useTheme must be used inside ThemeProvider");
  return t;
}
