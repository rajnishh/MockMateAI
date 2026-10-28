# Reelkar v1.0

Reelkar is a creator studio for India and the Gulf. It takes a person from "I want to be a creator" to posting every day: it builds their brand kit, turns ideas into reels, cartoons and songs, posts to Instagram, YouTube, Facebook, LinkedIn, TikTok and X, answers comments with DMs, and helps them earn from guides, courses and brand deals. The name follows *kalakar* and *filmkar*: *-kar* means "the one who makes". This system replaces the **Story to Film v0.0 draft**, which stays as a reference.

One system covers three apps with the same tokens and components:

| App | Built with | Layout |
|---|---|---|
| Phone and tablet (Android, iOS) | Expo / React Native | Bottom tab bar under 768px; icon sidebar from 768px |
| Web (SaaS) | Next.js | Sidebar + top bar from 1024px; phone layout below |
| Desktop (Windows, macOS, Linux) | Tauri shell around the web app | Same as web at 1024px+, plus system notifications, drag-and-drop and local export |

## Voice and content

- **Talk like a creator friend who knows the tricks.** Short sentences, everyday words, verbs first: "Make my reel", "Approve 5 reels", "Turn on auto-DM". No jargon like "pipeline", "asset" or "workflow" on screen.
- **Hinglish is welcome in Hindi mode, never forced in English mode.** Copy is written per language, not machine-mixed. Taglines: "The reel maker in your pocket" (English), "रील बनाओ, जेब से" (Hindi).
- **Always say the cost and the time** before an action: "2 credits · about 2 minutes".
- **Be honest about AI.** Every post says "Made with AI" where a platform asks, and reels carry Content Credentials (C2PA).
- **Never shame a small account.** Numbers are framed as progress: "+92 this week", not "only 1,284 followers".
- **Children's content** speaks to parents and never asks kids to comment or follow.
- Example strings: "Your reel is ready", "3 reels need your OK", "Instagram disconnected. Reconnect to keep posting.", "You're out of credits. Free reels refill on Monday."

## Visual foundations

**Dark by default.** The app looks like an editing suite at night, the place creators already work in CapCut and Instagram. Light theme is available and fully designed; the app follows the phone's setting until the person picks one.

**Two accents, two jobs.**
- `coral` is the record light: the **one** main action per screen ("Make my reel", "Post now", "Buy credits"), live and recording states. Fill with `on-coral` text; coral as text uses `coral-text`.
- `sky` is everything you can tweak: selection, links, progress, sliders, credit counts. Selected things sit on `sky-tint`.
- Everything else is neutral: `surface`, `surface-raised`, `surface-sunken`, `surface-overlay`, `line`, `line-strong`, `ink`, `ink-muted`. Status colours (`success`, `warning`, `danger`) always come with an icon and a word.

**Type.** Sora (display) for Latin headlines and the wordmark; Hind for all running text because one family covers Latin and Devanagari, with sister families for Bengali (Hind Siliguri), Tamil (Hind Madurai) and Telugu (Hind Guntur); Noto Sans Arabic for Arabic. JetBrains Mono only for timecodes and keywords. Indic and Arabic headlines use the body family at 700, never Sora. Body line height stays at 1.6 or more so vowel signs never clip.

**Shape and space.** Geometric and calm: `radius-md` (12px) for cards and inputs, `radius-pill` for buttons and chips, `radius-lg` for sheets. A 4px spacing grid (`space-1` … `space-7`); phones use 16px side margins, desktop 32px.

**Layout by width.** Under `bp-tablet` (768px): one column, bottom tab bar. 768-1023px: icon sidebar, two columns. From `bp-desktop` (1024px): full sidebar, list + detail panes. From `bp-wide` (1440px): week calendar with previews, 5-up reel grid. Content never exceeds `content-max`.

**Motion.** Quick and functional: 150ms ease-out for presses and toggles, 250ms for sheets. One signature moment: the reel icon turns a quarter turn while a reel is being made. Everything respects reduced-motion.

**Imagery.** The creator's own reels are the imagery. Empty states use simple shapes in the brand colours, never stock photos or 3D mascots.

## Iconography

[Lucide](https://lucide.dev) icons (ISC licence), 24px, 2px stroke, round caps and joins, `currentColor`. Use 18px inside chips and compact buttons. Platform identity uses neutral two-letter tiles (IG, YT, FB, in, TT, X); where a platform requires its official logo (sign-in, connect buttons), use its unmodified asset. Main icons: home, plus, calendar, inbox, indian-rupee (Earn), film (My reels), chart-line (Insights), palette (Brand kit), book (Creator school), sparkles (AI actions), mic (voice).

## Places in the app

Home (today's next action and the zero-to-hero checklist) · Create · Calendar · Inbox (comments, DMs, auto-replies) · Earn (lead magnets, courses, brand deals) · My reels · Insights · Brand kit · Creator school · Settings.

## Accessibility and reach

- WCAG 2.1 AA in both themes: text 4.5:1 or better on its stated surfaces, borders and icons 3:1. Coral on the light surface is 2.9:1, so coral shapes always carry a text label.
- Touch targets at least `tap-min` (48px); buttons 52px on touch, 40px with a mouse.
- Arabic flips the whole layout right-to-left (tab order, sidebar side, progress direction); icons with direction (send, arrows) mirror.
- Built for low-end Android: no blur effects, no video autoplay on lists, thumbnails lazy-loaded.

## Tokens in code

Use the token names as they are: CSS custom properties on web and desktop (`var(--coral)`), and the same names in a `theme.ts` object for Expo. Component class names use the `rk-` prefix.
