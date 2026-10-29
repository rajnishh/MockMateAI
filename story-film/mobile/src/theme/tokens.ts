// Generated from design/v1.0/tokens.json by scripts/gen-theme.mjs. Do not edit by hand.
export const palette = {
  "light": {
    "surface": "#f4f6fa",
    "surfaceRaised": "#ffffff",
    "surfaceSunken": "#e3e8f2",
    "surfaceOverlay": "#ffffff",
    "line": "#d6dbe5",
    "lineStrong": "#7b869c",
    "ink": "#111827",
    "inkMuted": "#4b5563",
    "brand": "#18264a",
    "onBrand": "#ffffff",
    "onBrandMuted": "#c9d2e6",
    "brandText": "#18264a",
    "action": "#18264a",
    "onAction": "#ffffff",
    "teal": "#2bc4b4",
    "onTeal": "#062a26",
    "tealText": "#0a756b",
    "tealTint": "#ddf5f2",
    "coral": "#f27a5e",
    "onCoral": "#2a0c05",
    "coralText": "#b4442b",
    "coralTint": "#fde7e1",
    "success": "#1e7a4c",
    "warning": "#8a5a00",
    "danger": "#b42318",
    "focusRing": "#0a756b",
    "scrim": "rgba(17, 24, 39, 0.55)"
  },
  "dark": {
    "surface": "#0b1220",
    "surfaceRaised": "#141e33",
    "surfaceSunken": "#070c16",
    "surfaceOverlay": "#1c2842",
    "line": "#26324d",
    "lineStrong": "#66749a",
    "ink": "#eef2f8",
    "inkMuted": "#a3aeca",
    "brand": "#18264a",
    "onBrand": "#ffffff",
    "onBrandMuted": "#c9d2e6",
    "brandText": "#c9d2e6",
    "action": "#2bc4b4",
    "onAction": "#062a26",
    "teal": "#2bc4b4",
    "onTeal": "#062a26",
    "tealText": "#4fd8c8",
    "tealTint": "#0f3a3a",
    "coral": "#f27a5e",
    "onCoral": "#2a0c05",
    "coralText": "#ff9c84",
    "coralTint": "#3a1a14",
    "success": "#5fd39a",
    "warning": "#f6c454",
    "danger": "#ff8b7e",
    "focusRing": "#4fd8c8",
    "scrim": "rgba(0, 0, 0, 0.6)"
  }
} as const;

export type ColorName = keyof typeof palette.light;

export const space = {"1":4,"2":8,"3":12,"4":16,"5":24,"6":32,"7":48} as const;
export const radius = {"sm":8,"md":12,"lg":20,"pill":999} as const;
export const size = {"tapMin":48,"buttonHeight":52,"buttonHeightCompact":40,"tabbarHeight":64,"sidebarWidth":248,"topbarHeight":56,"contentMax":1200} as const;
