// Generated from design/v2.0/tokens.json by scripts/gen-theme.mjs. Do not edit by hand.
export const palette = {
  "light": {
    "surface": "#f6f7fb",
    "surfaceRaised": "#ffffff",
    "surfaceSunken": "#e8ecf5",
    "surfaceOverlay": "#ffffff",
    "line": "#d6dbe5",
    "lineStrong": "#7b869c",
    "ink": "#0f1733",
    "inkMuted": "#4b5563",
    "brand": "#18264a",
    "onBrand": "#ffffff",
    "onBrandMuted": "#c9d2e6",
    "brandText": "#18264a",
    "action": "#ff5a36",
    "onAction": "#18264a",
    "teal": "#2bc4b4",
    "onTeal": "#062a26",
    "tealText": "#0a756b",
    "tealTint": "#ddf5f2",
    "coral": "#ff5a36",
    "onCoral": "#2a0c05",
    "coralText": "#c2410c",
    "coralTint": "#ffe6de",
    "pop": "#ffd23f",
    "onPop": "#2a1f00",
    "success": "#1e7a4c",
    "warning": "#8a5a00",
    "danger": "#b42318",
    "focusRing": "#0a756b",
    "scrim": "rgba(15, 23, 51, 0.55)"
  },
  "dark": {
    "surface": "#0a0a12",
    "surfaceRaised": "#14141f",
    "surfaceSunken": "#07070d",
    "surfaceOverlay": "#1c1c2b",
    "line": "#2a2a3d",
    "lineStrong": "#5a5a78",
    "ink": "#f2f2f7",
    "inkMuted": "#a0a0b8",
    "brand": "#1a0f2e",
    "onBrand": "#ffffff",
    "onBrandMuted": "#c9c1e6",
    "brandText": "#f2f2f7",
    "action": "#ff2e88",
    "onAction": "#0a0a12",
    "teal": "#2de2e6",
    "onTeal": "#04262a",
    "tealText": "#2de2e6",
    "tealTint": "#0c2a30",
    "coral": "#ff2e88",
    "onCoral": "#0a0a12",
    "coralText": "#ff6fae",
    "coralTint": "#2a0f1e",
    "pop": "#c8ff3d",
    "onPop": "#0a0a12",
    "success": "#5fd39a",
    "warning": "#f6c454",
    "danger": "#ff8b7e",
    "focusRing": "#2de2e6",
    "scrim": "rgba(0, 0, 0, 0.65)"
  }
} as const;

export type ColorName = keyof typeof palette.light;

export const space = {"1":4,"2":8,"3":12,"4":16,"5":24,"6":32,"7":48} as const;
export const radius = {"sm":8,"md":12,"lg":20,"pill":999} as const;
export const size = {"tapMin":48,"buttonHeight":52,"buttonHeightCompact":40,"tabbarHeight":64,"sidebarWidth":248,"topbarHeight":56,"contentMax":1200} as const;
