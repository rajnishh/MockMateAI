// Renders the mobile app's icon, splash and favicon PNGs from the v3.0 "Masala Pop" mark.
// Run from story-film/: node scripts/app-icons.mjs  (uses sharp, which Next.js installs).
// The mark matches LOGO in mobile/src/components/icon.tsx: a saffron reel with plum holes
// and a chilli hub, a mint film strip, on a deep-plum tile.
import { mkdirSync } from "node:fs";
import sharp from "sharp";

const OUT = new URL("../mobile/assets/images/", import.meta.url).pathname;
const PLUM = "#2a1235";
const SAFFRON = "#ffb21a";
const MINT = "#14d9a0";
const CHILLI = "#ff4d2e";

// The reel and strip on a 112 grid, drawn around (54, 54) like the in-app logo.
const HOLES = [[54, 36], [71, 48], [65, 68], [43, 68], [37, 48]];

function reel({ fill = SAFFRON, holes = PLUM, strip = MINT, hub = CHILLI } = {}) {
  return [
    `<rect x="56" y="80" width="36" height="8" rx="4" fill="${strip}"/>`,
    `<circle cx="54" cy="54" r="32" fill="${fill}"/>`,
    ...HOLES.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="6" fill="${holes}"/>`),
    `<circle cx="54" cy="54" r="5" fill="${hub}"/>`,
  ].join("");
}

// One colour, with the holes cut out, for Android's themed icons.
function reelMono(colour) {
  const holes = HOLES.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="6" fill="black"/>`).join("");
  return `<defs><mask id="m"><rect width="112" height="112" fill="white"/>${holes}<circle cx="54" cy="54" r="5" fill="black"/></mask></defs>
    <g mask="url(#m)"><circle cx="54" cy="54" r="32" fill="${colour}"/></g>
    <rect x="56" y="80" width="36" height="8" rx="4" fill="${colour}"/>`;
}

// `scale` shrinks the artwork around the tile centre, leaving room for platform masks.
const svg = (body, { bg, rx = 0, scale = 1 } = {}) => {
  const pad = (112 * (1 - scale)) / 2;
  const tile = bg ? `<rect width="112" height="112" rx="${rx}" fill="${bg}"/>` : "";
  // The reel and strip span x 22–92 and y 22–88; nudge them so the group sits centred.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 112 112">${tile}<g transform="translate(${pad + 1} ${pad + 1}) scale(${scale})">${body}</g></svg>`;
};

const files = {
  // iOS masks the corners itself, so the tile is full-bleed.
  "icon.png": [svg(reel(), { bg: PLUM, scale: 0.92 }), 1024],
  // Shown on cream (light) and plum night (dark): a rounded plum tile reads on both.
  "splash-icon.png": [svg(reel(), { bg: PLUM, rx: 30 }), 512],
  "favicon.png": [svg(reel(), { bg: PLUM, rx: 30 }), 96],
  // Android adaptive icons keep the middle 66% safe, so the artwork is smaller.
  "android-icon-background.png": [svg("", { bg: PLUM }), 1024],
  "android-icon-foreground.png": [svg(reel(), { scale: 0.62 }), 1024],
  "android-icon-monochrome.png": [svg(reelMono("#ffffff"), { scale: 0.62 }), 1024],
};

mkdirSync(OUT, { recursive: true });
for (const [name, [source, size]] of Object.entries(files)) {
  await sharp(Buffer.from(source), { density: (72 * size) / 112 }).resize(size, size).png().toFile(OUT + name);
  console.log(`${name} ${size}px`);
}
