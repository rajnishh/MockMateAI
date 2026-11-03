# Design system

## v3.0: Masala Pop (current, 2026-11-03)

A bolder, warmer brand, with layouts like the Bachat app's Home:
- **Colours:** a saffron-to-marigold hero with plum text, chilli for the main button, mint for AI and wins, and plum ink on cream.
- **Dark mode:** plum night, with the same saffron hero.
- **Layout:**
  - Each page has one hero card with the number that matters, plus Ask Reelkar.
  - Actions sit in an icon grid.
  - A deep-plum sidebar on desktop and a floating plum tab bar on phones.
- **Type:** Bricolage Grotesque headings and Inter text, with Hind for Indic scripts.
- **Logo:** the reel logo stays, in plum and marigold.

Files:
- `v3.0/directions.html`: the four directions compared (Masala Pop, Studio Violet, Premiere Night, Coral Wave).
- `v3.0/mockups.html`: Home and Make a reel for the web, on desktop and phone, in light and dark.
- `v3.0/tokens.json`: the v3.0 tokens. The token names are v2.0's, plus `hero-start`, `hero-end`, `hero-ring`, `deep` and `on-deep`. Both apps use it:
  - **Web:** `src/app/globals.css`. Home dashboard at `/`, Make a reel at `/create`, Brand kit at `/brand`, Insights at `/insights`.
  - **Mobile:** `npm run theme` in `mobile/` generates `src/theme/tokens.ts` from this file. Fonts are Inter and Bricolage Grotesque.

## v2.0: Creator energy (2026-10-31)

More energy for creators, keeping the v1.0 reel logo:
- **Light theme, "Creator studio":** navy with a stronger coral for main buttons (navy text on coral), a sunny yellow for wins, bigger radii, pressable buttons, and Plus Jakarta Sans.
- **Dark theme, "Neon night":** near-black with neon pink, cyan and lime, glows, and Space Grotesk headings.
- **Motion:**
  - The logo animates: the reel turns, the film tail feeds out and the hub clicks. It loops on a new splash screen and wherever something loads, instead of a spinner or grey skeleton.
  - Screens slide in piece by piece, progress bars shimmer, chips pop, and confetti plays when a reel is ready.
  - All of it is off with reduced motion.

Files and links:
- `v2.0/prototype.html`: the v1.0 prototype with the v2.0 tokens, splash, loaders and motion. Published: https://claude.ai/artifact/3WniUxZ8zBAVrhc5jJR8tK
- Style directions and the five animated logo marks: https://claude.ai/artifact/6aCNu5hnuvBaqN2aEMkyBo

Chosen logo treatment, "Option 1+": the original reel stays the one mark (app icon, splash, header). Short loads show the reel spinning, long waits add coral and teal rings, and a finished reel gets one ring burst and confetti.

- `v2.0/tokens.json`: the v2.0 tokens (adds `pop` / `on-pop`). Kept for reference; both apps now use v3.0.

## v1.0: Reelkar (Trust Navy)

Brand book, tokens, components and phone, web and desktop screens, as a Claude Design System artifact:
https://claude.ai/artifact/UBYyBwMR62t7oBhgWNQsy5

- `v1.0/tokens.json`: its tokens (Trust Navy: light default + dark, type, spacing, radius, sizes, breakpoints, shadows). The Expo, web and desktop apps generate their themes from this file.
- `v1.0/brand.md`: its brand book (voice, visual foundations, iconography, places in the app, accessibility).
- `v1.0/components.css`: reference component styles (`rk-` classes) used by the artifact's previews.
- `v1.0/logo/`: the app icon and the reel mark (SVG).
- `v1.0/prototype.html`: clickable wireframes of all 40 screens (phone and desktop, light and dark, empty/loading/error states). Published: https://claude.ai/artifact/A3YU4eFPh8WDdKdHLxRNfc

When the artifact changes, refresh these copies.

## v0.0: Story to Film (draft)

The first peacock/marigold system, kept for reference: https://claude.ai/artifact/BSn8jyzsznEwJSgi7QSnns (copies in `v0.0/`).

## Other design files

- Brand directions (Qissa, Reelkar, Kathaa, Filmy, Jugnu, v0.0): https://claude.ai/artifact/DHH2tfKbuFHqEunJM8MGYy
- The project's design agent: `.claude/agents/senior-ux-brand-designer.md`
