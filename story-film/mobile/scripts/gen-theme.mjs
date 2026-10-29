// Generates src/theme/tokens.ts from the design system tokens
// (../design/v1.0/tokens.json). Run: npm run theme
import { readFileSync, writeFileSync } from "node:fs";

const src = new URL("../../design/v1.0/tokens.json", import.meta.url);
const out = new URL("../src/theme/tokens.ts", import.meta.url);
const t = JSON.parse(readFileSync(src, "utf8"));

const px = (v) => Number(String(v).replace("px", ""));
const camel = (n) => n.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
// spacing/radius keep their step ("space-4" -> 4, "radius-md" -> md); size keeps its full name.
const group = (fam, strip = true) =>
  Object.fromEntries(t[fam].tokens.map((x) => [strip ? x.name.replace(/^[a-z]+-/, "") : camel(x.name), px(x.value)]));

const colors = { light: {}, dark: {} };
for (const tok of t.color.tokens) {
  const key = camel(tok.name);
  colors.light[key] = tok.value.light;
  colors.dark[key] = tok.value.dark ?? tok.value.light;
}

const body = `// Generated from design/v1.0/tokens.json by scripts/gen-theme.mjs. Do not edit by hand.
export const palette = ${JSON.stringify(colors, null, 2)} as const;

export type ColorName = keyof typeof palette.light;

export const space = ${JSON.stringify(group("spacing"))} as const;
export const radius = ${JSON.stringify({ ...group("radius"), pill: 999 })} as const;
export const size = ${JSON.stringify(group("size", false))} as const;
`;
writeFileSync(out, body);
console.log("wrote", out.pathname);
