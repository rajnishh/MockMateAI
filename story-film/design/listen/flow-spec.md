# Listen, phase 1: public songs and a player that keeps going

Status: design spec v1, 2026-11-06. Not built.
Design system: v3.0 Masala Pop (`design/v3.0/tokens.json`); token names below are the ones in that file.
Mockups: `design/listen/mockups.html` (iPhone: Listen, full player, queue sheet, mini player, song page, publish + handle; web public song page at desktop and phone width; light/dark; the web page in English, Hindi and Arabic).
Reuses: the community spec (`design/community/flow-spec.md`): the public-page shell of `/g/{token}`, its Report sheet and reasons, its language rules, karaoke lyrics and accessibility rules. Builds with `mobile/src/components/ui.tsx`, `song-player.tsx`, `mini-player.tsx`, `songs/play/[id].tsx`.

---

## Frame

- **Goal:** songs made in Reelkar get heard by people other than their maker, and listening turns into making ("I can make one like this").
- **The one thing to get right:** press play once and it keeps going, across creators and languages, with no dead end.
- **One job per screen:** Listen = start something good in one tap; Queue = see and trim what's next; Song page = enjoy this song and find the next; Publish = put my song out, safely, in under 20 s; Public web page = play the song from a WhatsApp link with no sign-in.
- **Success metrics (first 30 days):** 25% of weekly active creators open Listen; median listening session 4+ songs (autoplay working); 10% of published songs get a Remix or "Make your own" tap from listeners; 15% of creators with a finished song publish one; reports under 1 per 200 published songs.

## Decision 1: where Listen lives

| Option | For | Against |
|---|---|---|
| **A. Listen replaces Earn as the 5th tab** (recommended) | Earn is a coming-soon placeholder today (`(tabs)/earn.tsx`); Listen is a daily-return surface that earns a tab; one tap from anywhere; the MiniPlayer already sits above the tab bar, so tab + player read as one system | Changes PLAN decision 19's tab list; Earn needs a new home |
| B. A Listen rail inside Home | No tab change | Home's job is "make this week's reels"; a rail there is a teaser, not a place to listen for 20 minutes |
| C. Listen entry in Create / Song Studio | Close to songs | Two levels deep; Song Studio is "my songs", mixing mine and everyone's confuses both |

**Recommendation: A.** Tabs become **Home · Create · Calendar · Inbox · Listen** (Listen uses a new `headphones` icon). Earn moves to a card on Home ("Earn from your followers · coming after the beta") and a row in Account, until it ships; when it ships we revisit (Calendar and Inbox are candidates to merge). Home also gets one small **"New on Listen"** card under Song Studio (3 covers + "Play"), so creators who never tap the tab still discover it.

This is a proposed change to PLAN decision 19; it needs the owner's yes.

---

## Flows

```
PUBLISH (creator, app)
  Song Studio › song (songs/[id], completed)
    └─ "Share on Listen" card · Private ── Publish ─┐
                                                    ├─ no handle yet → P1 Pick your handle → P2
                                                    └─ has handle    → P2 Publish sheet
       P2: cover · title (editable) · genre · language (auto) · Show lyrics [on] · Allow remixes [on]
           "Made with AI" note · [Publish song]
         ├─ safety check passes → P3 "Your song is on Listen" · Share link · Copy · See it on Listen
         ├─ safety check fails  → inline error, stays private, says what to change
         └─ offline / server    → inline error, Try again (nothing published)
  Later: card shows Public · 214 plays · 31 likes · [Make private]  (confirm dialog)
         taken down → card shows "Removed from Listen after a report" · [Ask for a review]

LISTEN (listener, app)
  Tab Listen (L1)
    ├─ tap a song in a rail → plays it; queue = rest of that rail; Autoplay continues after
    ├─ tap "Play all" on the hero → shuffled "Fresh for you" mix
    ├─ tap a language tile → L2 language list (New / Trending in that language) 
    ├─ tap a row title / "See all" → L2 list for that rail
    └─ long-press a song (or ⋯) → Play next · Add to queue · Open song · Not for me · Report
  Mini player (M1) above the tab bar  → tap → Full player (FP)
  Full player → Queue button → Queue sheet (Q1): Now playing · Next up · Remove · Clear · Autoplay
  Full player → title / @handle → Song page (S1)
  Lock screen / Control Center: play/pause, previous, next, scrub, cover + title + @handle

SONG PAGE (app)  s/[id]
  Play · lyrics · plays · Like / Not for me · Reactions · Remix · Share · More like this · By this creator · Report
    ├─ Remix → Song Studio remix (songs/[id]?remixOf=…) with the original loaded; credits shown before Make
    ├─ Share → native share sheet with reelkar.app/s/{publicId}
    └─ unpublished / taken down / not found → S1 error states

PUBLIC WEB  reelkar.app/s/{publicId}  (no sign-in)
  Cover · title · @handle · Play (user gesture) · karaoke lyrics · plays
  · Like / reactions → one-screen sign-in (community R2) then back, with the tap applied
  · More like this (auto-advance after the song, 5 s countdown, Cancel)
  · Make your own song (primary) · Get the app · Made with AI · Report (no sign-in)

SIGNED-IN WEB  /listen
  Same rails as L1 in the app shell; a bottom player bar; queue opens as a right panel (desktop) / sheet (phone)
```

---

## Screens (iPhone)

| # | Screen | Route | Builds from |
|---|---|---|---|
| L1 | Listen tab | `(tabs)/listen.tsx` (replaces `earn.tsx`) | `Screen`, `Hero`, new `SongRail`, `SongTile`, `LanguageTile` |
| L2 | List (rail "See all", a language, a genre) | `listen/[list].tsx` (`new`, `trending`, `genre-sufi`, `lang-ta`) | `ListRow`-style `SongRow` |
| M1 | Mini player | `components/mini-player.tsx` | existing, adds Next and handle |
| FP | Full player | `songs/play/[id].tsx` | existing, adds prev/next, like, queue |
| Q1 | Queue sheet | `components/queue-sheet.tsx` (modal sheet over FP or from M1 long-press) | new |
| S1 | Song page (public) | `s/[id].tsx` (same path as the web link, so universal links map 1:1) | `Screen`, `Header`, `SongPlayerRow`, `SongRail` |
| P1 | Pick your handle | sheet in `songs/[id]` | `Field`, `Chip` |
| P2 | Publish sheet | sheet in `songs/[id]` | `SongCover`, `Field`, `Switch` row |
| P3 | Published | same sheet, success state | `Win`, `Button` |
| SC | "Share on Listen" card in Song Studio | `songs/[id].tsx` | `Card`, `Status` |
| RP | Report sheet | `components/report-sheet.tsx` (shared with gifts) | community "Report" |

### L1. Listen tab

Order, top to bottom (all one vertical `ScrollView`; rails scroll sideways):

1. **Header row:** title "Listen" (`title-lg`) and `Credits` on the right, as on other tabs. No search in phase 1 (and no search icon that does nothing).
2. **Hero** (the v3.0 one-hero rule; the number that matters is fresh songs): overline "This week", headline **"{n} new songs from creators"**, caption "Hindi, Tamil, Arabic and more". Button **Play all** (`deep` fill on the hero, 52 pt, because chilli on saffron fails 3:1, same rule as the gift page). Plays a shuffled mix of New + Trending, newest weighted, max 2 songs per creator, then Autoplay.
3. **Language chips** (`ChipRow`, single select, sticky under the header once scrolled): **All** · हिन्दी · Hinglish · தமிழ் · العربية · বাংলা · తెలుగు · मराठी · English. Native names, in their script (Arabic chip text right-aligned inside its pill, the row itself follows the UI direction). The listener's app language is pre-selected the first time only if they've played nothing yet; otherwise **All**. Filters every rail below. Chips for languages with fewer than 3 public songs are hidden.
4. **Rail "New"**: newest published, 10 tiles, "See all".
5. **Rail "Trending this week"**: numbered tiles (1–10, the rank in a `pop` badge with the number in text, not colour alone).
6. **Rail "Best of {genre}"**: one rail per genre with 5+ songs, max 3 rails, genres the listener plays most first, then the featured list order (`FEATURED` in `lib/songs.ts`). Title uses `genreLabel`, e.g. "Best of Sufi". Ranked by likes in the last 30 days.
7. **"By language" grid**: 2-column tiles (only when the chip is **All**): the language's native name in `title-md`, the English name in `caption`, song count. Tap → L2 for that language.
8. **Your songs on Listen** (only if the creator has published): a single `ListRow` "You have 2 songs on Listen · 214 plays" → Song Studio.

**SongTile** (rails): 148 pt wide; cover 148×148 `radius-md`; play dot 40 pt bottom-right on the cover (`scrim` circle, white glyph; the playing one is `pop` with `on-pop` pause glyph and an animated 3-bar equaliser, static with reduce motion); title `label` 2 lines max; caption "@handle · 2:14" 1 line. Whole tile = play (the queue becomes the rest of the rail); the title area opens S1 (two targets, each 44 pt+). Long-press → action sheet.

States:

| State | What shows |
|---|---|
| Loading | Hero skeleton (140) + 2 rails of 3 tile skeletons (`surface-sunken`, no spinner) |
| Empty (no public songs at all, launch week) | `Empty` with a music illustration: title "Be one of the first on Listen", text "Songs creators share show up here. Publish one of yours and it could be the first thing people hear.", button **Publish a song** → Song Studio. If the creator has no songs: **Make a song** → `songs/new` |
| Empty language filter | Inside the rails area: "No {language} songs yet. Make the first one?" + **Make a song in {language}** (prefills language in `songs/new`) + "Show all languages" link |
| Error | `Banner kind="error"` "Couldn't load songs. Check your internet." + **Try again**; anything cached stays visible under it |
| Offline | `Banner kind="warn"` "You're offline. Songs you played recently can't be saved for offline yet." Rails show cached data greyed play dots; tapping play shows toast "Connect to the internet to play" |

### L2. List

`Header` with back, title ("New", "Trending this week", "Best of Sufi", "தமிழ் · Tamil"), sub "{n} songs". Primary **Play all** (`action`, full width, under the header, not pinned). `SongRow` list: cover 56, title, "@handle · Genre · 2:14", trailing ⋯ (44 pt). Infinite scroll, 20 per page, row skeletons at the end while loading. Same empty/error/offline as L1.

### M1. Mini player (existing, changed)

`deep` bar (dark: `surface-overlay`), 60 pt tall, radius 18, above the tab bar. Left to right:
- Cover 42.
- Title (`label`, 1 line) and "@handle · Genre" (`caption`, 1 line). For the creator's own private song: "Your song · Genre" (today's behaviour).
- **Play/Pause** 44 pt (`pop` fill, `on-pop` glyph).
- **Next** 44 pt (new; `on-deep` glyph, no fill). Hidden when the queue is empty and Autoplay is off.
- **Close** stays (×, 44 pt) only when nothing is queued; with a queue, closing is done from the queue sheet's **Clear** or by swiping the bar down (with a 4 s "Player closed · Undo" toast).
- Progress line (`teal` on 14% `on-deep`) along the bottom.
- Tap the bar → FP. Long-press → Q1 directly.
- When Autoplay picks the next song, the subtitle shows "Autoplay · @handle" for that song.

### FP. Full player (existing, changed)

Keeps the cover-on-the-beat, sparkle dust, lyrics in time, waveform scrubber and theme picker. Changes:
- Top bar: Close (chevron) · centre "Playing from {source}" overline + "Trending this week" caption (replaces NOW PLAYING) · right **Queue** (list icon, 44 pt, badge with the count of next songs). Share moves into the action row below.
- Under the title: **@handle** (`label`, `INK_MUTED`, tappable → S1 of this song). For own private songs: "Only you can hear this" with a lock icon.
- **Action row** (public songs only), 4 buttons, 48 pt each, icon + label underneath: **Like** (heart, filled `pop` when on, label "Liked") · **Not for me** (thumb-down; tapping it marks the dislike, shows toast "Got it. Fewer songs like this." and skips to next) · **React** (smile; opens the reaction tray above the row) · **Share**.
- Controls: **Previous** · **Back 10 s** · **Play/Pause** 76 · **Forward 10 s** · **Next**. Previous restarts the song if more than 3 s in, else goes back. Previous/Next 48 pt, ±10 s 44 pt (they keep the existing glyphs). With no queue and Autoplay off, Next is disabled (40% opacity, still announced "Next, no more songs").
- Auto-advance: at the end, the next song starts after a 1.5 s gap; no countdown in the app (it's a player, not a page).

### Q1. Queue sheet

Bottom sheet, `surface-raised`, `radius-lg` top corners, `elevation-2`, opens at 70% height, drag to full. Grabber, sheet title **"Up next"** (`title-md`) with **Clear** (text button, `coral-text`, 44 pt) on the right.

1. **Now playing** (caption 700, not an uppercase overline so it translates): one row, cover 56, title, "@handle · Genre", equaliser glyph. Not removable.
2. **Next up · {n}** : rows with cover 48, title, "@handle · 2:14", and a trailing **Remove** button (× in a 44 pt target, label "Remove {title} from queue"). Swipe left to remove also works (iOS-native), with the row sliding out and a "Removed · Undo" toast (4 s). Drag handle on the leading edge to reorder (phase 1 nice-to-have; the spec'd minimum is Remove).
   - Empty next-up: "Nothing queued. Long-press any song and pick Play next."
3. **Autoplay card** (`surface-sunken`, radius-md, 16 padding):
   - Row: label **"Keep the music going"** + `Switch` (on by default).
   - Helper (`caption`, `ink-muted`): **"When your queue ends, we'll play songs like these: same style, language or mood."**
   - When on, under it: "Coming up from Autoplay" and 3 rows at 70% emphasis (`ink-muted` titles), each with a **Not for me** thumb (removes it and tunes the next picks). These are real picks, so what you see is what plays.
   - When off: "Music stops when your queue ends."
- **Clear** asks nothing (it's undoable): clears Next up, keeps the current song, toast "Queue cleared · Undo".

**Related songs (Autoplay picks)**, server `GET /api/listen/related?songId=&exclude=`:
- Score candidates (public, not taken down): same genre +3, same language +2, same mood +1, liked by people who liked this +2 (phase 1: skip if no data), in the last 30 days +1.
- Exclude: every song heard this session (the app sends the session's song ids; a session = since the app came to the foreground after 30+ min away), anything the listener marked Not for me (ever), their own songs, songs from a creator they disliked twice.
- Spread: no creator twice in a row; after 3 songs in one language, the 4th may be another language with the same genre (this is the "across languages" feel the owner liked).
- Fallback ladder when fewer than 3 candidates: same language trending → all trending → New. If nothing is left at all: the player stops and the queue shows "You've heard everything new. Check back tomorrow, or make your own song." + **Make a song**.
- The app fetches 5 picks when 1 song is left in the queue, so there's no gap.

### Lock screen and background

- Background audio on (`UIBackgroundModes: audio`); playback continues with the screen off and in other apps.
- Now Playing info: title, "@handle" as artist, "Reelkar" as album, cover art (256 px JPEG), duration and position.
- Remote commands: play, pause, **next track**, **previous track**, scrub (`changePlaybackPosition`). Skip-forward/back 10 s are not registered (iOS shows either next/previous or skip intervals, not both; next/previous wins).
- Headphone/AirPods double-tap = next, triple = previous (system default once commands are registered).
- Interruption (call, WhatsApp voice note): pause, resume when the interruption ends with `shouldResume`.
- Build note: check that the Expo SDK 58 `expo-audio` lock-screen API exposes next/previous remote commands. If it doesn't, swap the player engine to `react-native-track-player` behind the existing `useSongPlayer()` interface (the screens don't change).

### S1. Song page (public song)

`Screen` with `Header` (back, title empty until scrolled; right: **Share** icon and ⋯ menu: Add to queue · Play next · Report). Content:

1. **Hero card** (one hero): cover 200×200 centred on the `hero` gradient, title (`title-lg`, `on-brand`, 2 lines, wraps), "@handle" (`label`, tappable → scrolls to "By this creator"), meta chips "Sufi · हिन्दी · 3:12" (`chip` fill), and **"Made with AI"** pill (`deep`). If sung in the creator's own voice: second pill "Sung in @handle's own voice".
2. **Player row** (`SongPlayerRow`, play 56 pt `action` fill on `surface-raised`, outside the hero so the chilli button meets contrast), stats line under it: **"12.4K plays · 1.1K likes"** (compact numbers by locale: `Intl.NumberFormat(locale, { notation: "compact" })`, which gives "12 हज़ार" in Hindi and "12 ألف" in Arabic).
3. **Action row**, same 4 as FP but **Remix** replaces React (React lives in the reaction tray row below): **Like** · **Not for me** · **Remix** · **Share**. Remix hidden when the creator turned remixes off or the song is in their own voice; in its place a disabled-looking label is *not* shown (just 3 buttons).
4. **Reactions row**: six reaction buttons as pills (emoji + count), 44 pt tall, horizontal, wraps on large text. One reaction per person per song (tap another to change, tap yours again to remove). Selected = `teal-tint` fill + 1.5 pt `teal-text` border + check, not colour alone.
   - The set: 🔥 **Fire** · 💃 **Dance** · 🥹 **Touched** · 😂 **Haha** · 🙏 **Respect** · 🎉 **Celebrate**. Chosen because they map to what people actually say about songs here (fire track, makes me dance, it touched me, funny, respect for bhakti/sufi, wedding and Eid songs), read the same in India and the Gulf, and avoid hearts (Like already is the heart). Emoji are content, not UI icons; each has a text label for screen readers and in a long-press tooltip.
   - Counts shown per reaction once that reaction has 3+; below 3 the pill shows just the emoji (no "1", which reads as lonely and identifies people).
5. **Lyrics** card (if the creator kept "Show lyrics" on): the community karaoke well; "Lyrics" heading; collapsed to 8 lines with **Show all lyrics** when not playing; follows along when playing. Hidden for instrumentals ("Instrumental" caption under the title instead).
6. **Remix credit** (if this is a remix): `ListRow` "Remix of 'Baarish Wali Chai' by @chai.with.meera" → that song's S1. If the original is gone: "Remix of a song that's no longer public" (no link).
7. **Rail "More like this"** (same related endpoint, 10 tiles). Tapping a tile plays it and replaces Next up with the rest of the rail.
8. **Rail "By @handle"** (their other public songs, newest first; hidden if none). Header row has the handle and "{n} songs".
9. Footer: **Report this song** (text button, `ink-muted`, 44 pt) and "Made with AI on Reelkar · Content Credentials" when signed.

Own song viewed here (creator taps their own @handle): action row becomes **Edit in Studio** · **Share** · **Make private**; Like/React hidden; stats show "Likes 31 · Not for me 4" privately (see open question 3).

States:

| State | Trigger | What shows |
|---|---|---|
| Loading | first open | Hero skeleton, player skeleton, 2 rail skeletons |
| Error | network | `Banner kind="error"` "Couldn't open this song. Check your internet." + **Try again** |
| Made private | creator unpublished | `Empty`: "This song is private now" / "The creator took it off Listen." + **Back to Listen**. If it's in the queue, the player skips it silently and shows it in the queue as struck-out "No longer available" until the next refresh |
| Taken down | report upheld | "This song was removed after a report." + **Back to Listen** |
| Not found | bad link | "We couldn't find this song. Check the link and try again." |
| Audio fails | load error or stall > 8 s | Player row inline error "The song didn't load. Tap to try again."; in a queue, auto-skip after 3 s with toast "Skipped a song that didn't load" |

### Remix from someone else's song

- **Remix** opens Song Studio's existing remix panel (`StudioRemix`, kinds cover / extend / replace / rap) on a new screen `songs/remix/[publicId]`, with a header card "Remixing 'Pind Di Kudi' by @harjot.beats" and the original's player. Price on the button as today ("Cover · 2 credits"). Nothing is charged until **Make**.
- Voice picker on a remix lists AI singers and the remixer's own consented voices only (community voice rule: never the original creator's voice; API refuses a `voiceId` the caller doesn't own).
- The result is the remixer's private song with `remixOfSongId` set; if they publish it, the song page shows the credit line, and the original creator gets an Inbox item "@sana.sings remixed your song Pind Di Kudi".
- Edit and Mix tabs aren't offered on other people's songs (Mix needs stems of a song you own).

### SC. "Share on Listen" card in Song Studio (`songs/[id]`)

Placed after "Make it a gift" / "Save or share", before "Make music video".

| State | Card content | Action |
|---|---|---|
| Private (default) | Lock icon · **"Only you can hear this"** · "Publish it to Listen so anyone on Reelkar and anyone with the link can play it." | **Publish** (secondary button; the screen's primary stays Make it a gift) |
| Public | Globe icon · `Status` "On Listen" (success, check + word) · "214 plays · 31 likes · 12 reactions" · link "reelkar.app/s/k3Lm9Qx2Ab" | **Share link** (secondary) · **Make private** (ghost) |
| Taken down | `Status` "Removed after a report" (danger, icon + word) · "It's private again. Reason: Copyright." | **Ask for a review** (opens the grievance form) |
| Not publishable | own-voice song when the owner says no (open question 6) or a failed song | Card hidden |

**Make private** confirm (native `Alert`): title "Make this song private?", text "It leaves Listen and its link stops working. Plays and likes are kept if you publish it again." Buttons: **Cancel** · **Make private** (destructive style).

### P1. Pick your handle (first publish only)

Sheet title **"Pick your name on Listen"**; text "This is how people find your songs. You can change it later."
- Field with a fixed "@" prefix (not editable, part of the field chrome), placeholder "yourname", `autoCapitalize="none"`, `autoCorrect={false}`, `keyboardType="ascii-capable"`. Prefilled with a suggestion: the brand kit's Instagram handle if set (`prefs.brand.handle`), else a Latin transliteration of the name ("Rajnish Kumar" → `rajnish.kumar`); phone sign-ups named "Creator 1234" get an empty field with suggestion chips only.
- Live check (300 ms debounce): `Status` row under the field: "@rajnish.sings is yours" (success, check) · "Taken. Try one of these:" (warning) + 3 suggestion chips (`rajnish.sings2`, `rajnish.music`, `sings.rajnish`) · rule errors inline (below).
- Helper always visible: "3 to 20 letters (a to z), numbers, dot or underscore."
- **Continue** (primary, disabled until available). Saves the handle, then slides to P2 in the same sheet (step dots "1 of 2").

Handle rules (recommendation, see open question 2):
- `^[a-z][a-z0-9._]{2,19}$`, no `..`, no trailing `.`; stored lowercase; Latin only (one script avoids look-alike spoofing across Devanagari/Arabic and works in URLs and @mentions on Instagram too).
- Reserved: `reelkar`, `admin`, `support`, `help`, `official`, `team`, `listen`, `api`, `www`, any celebrity on the existing real-artist block list, slurs list.
- Change at most once every 30 days; the old handle is held for 30 days so links and mentions don't jump to a stranger.
- Display name stays the account name; public pages show only the @handle in phase 1.

Errors: "Use 3 or more characters" · "Start with a letter" · "Only a to z, 0 to 9, dot and underscore" · "That name is reserved. Try another." · offline: "Can't check names offline. Connect and try again."

### P2. Publish sheet

Title **"Publish to Listen"**. Content:
- Preview row: cover 72 + title + "Sufi · हिन्दी · 3:12" (language and genre come from the song; not editable here).
- **Title** field (prefilled, 60 chars, counter). Required.
- `Switch` row **Show lyrics** (on): "People can read along."
- `Switch` row **Allow remixes** (on): "Others can make a cover or remix. You're always credited." Hidden for own-voice songs (forced off; caption "Songs in your own voice can't be remixed").
- Info `Banner` (`teal-tint`): "Your song will show **Made with AI**. Anyone on Reelkar, and anyone with the link, can play it. You can make it private any time."
- If own voice: extra line "It's sung in your own voice. People will see 'Sung in @handle's own voice'."
- Primary **Publish song** (`action`, full width, pinned in the sheet footer). Free; no credits.

On tap: the server re-runs the existing song safety checks (real-artist names, title and lyrics LLM check, decision 12) on the title as edited.
- Pass → P3.
- Fail → `Banner kind="error"` in the sheet: "We can't publish this title: it names a real artist. Change the title and try again." (the reason comes from the checker in plain words); the song stays private.
- Check unavailable → "We couldn't check your song right now, so it wasn't published. Try again in a minute." (fail closed, like song creation).

### P3. Published

Same sheet: `Win` "Your song is on Listen" with the cover; text "People can find it in New today."; buttons **Share link** (primary; native share sheet with the prefilled message) · **See it on Listen** (secondary, opens S1) · **Done** (ghost).
Share message: "Listen to my new song 'Sufi Raat' 🎶 reelkar.app/s/k3Lm9Qx2Ab" (emoji only inside the outgoing message, as in gifts).

---

## Web

### W1. Public song page `reelkar.app/s/{publicId}` (no sign-in)

Same shell, performance budget and no-JS fallback as the gift page (`src/app/g/[token]`): first load < 150 KB excluding audio, text first, cover as a dominant-colour block until loaded, `preload="metadata"`, 64 kbps AAC rendition on slow networks, `<audio controls>` inside `<noscript>`. Language from the browser (`en`, `hi`, `ar` in phase 1; Arabic sets `dir="rtl"`); the song's own text (title, lyrics) is shown as written, with `dir="auto"` and `lang` set from the song's language.

Layout, phone width (one column) and desktop (2 columns from `bp-desktop`: left sticky cover + player, right lyrics + rails):
- Top bar: reel mark + "Reelkar" wordmark (links to the home page) · **Get the app** (text button; universal link on iOS when installed, App Store otherwise).
- **Hero card**: cover (max 320), title, "@handle", chips "Sufi · हिन्दी · 3:12", **Made with AI** pill, own-voice pill when it applies.
- **Play** 56 pt, `deep` on the hero (same rule as the gift page), scrubber, `0:42 / 3:12` (`timecode`; player wrapped in `dir="ltr"`).
- Stats "12.4K plays" and the Like / reactions row. Tapping Like or a reaction when signed out opens the one-screen sign-in (community R2) as a sheet: title "Sign in to like this song", same Apple / Google / phone options; after sign-in the tap is applied and the page stays where it was (no redirect to the app).
- Karaoke lyrics (community R1 rules, including Follow along).
- **More like this** (6 rows). When the song ends: a card slides in "Next: {title} by @handle in 5" with **Play now** and **Cancel**; with reduced motion no slide, the countdown text updates. This is the web taste of "it just keeps going"; it only runs after the visitor pressed play once (browser autoplay rules).
- **By @handle** (up to 6).
- Sticky CTA after 10 s of play or at the end: **Make your own song** (`action`), caption "Free to start · about a minute" → web `/songs` (sign-in first).
- Footer: "Made with AI on Reelkar" · **Report** · Terms · Privacy.
- Remix on the web: shown as **Remix in the app** only when remixes are allowed (phase 1 web has no remix panel for others' songs); it opens the universal link.

Link preview (`og:`), rendered once per song like the gift card: `og:image` 1200×630 (cover left, `hero` panel right with title in Bricolage, "@handle", "Made with AI" pill; Arabic flips), `og:title` "{title} by @{handle}", `og:description` "Listen on Reelkar. Made with AI.", `og:type` `music.song`, no `og:audio`.

States: Made private ("This song is private now. The creator took it off Listen." + **Find more songs** → `/listen` which, signed out, shows the New rail read-only), Taken down ("This song was removed after a report."), Not found (404 same layout), Audio fails / slow network (gift page rules).

Counting: a play is counted after 30 s or half the song, whichever is first, once per browser (or signed-in user) per song per day; creators' own plays don't count. Copy says "plays", not "listeners".

### W2. Signed-in web Listen `/listen`

- New sidebar row **Listen** (headphones) in `app-shell.tsx`, under Song Studio.
- Page: same order as L1 (hero with Play all, language chips, rails, By language grid). Rails are horizontal scrollers with arrow buttons on `pointer: fine`; at desktop widths tiles are 176 px.
- **Player bar** fixed at the bottom of the content column (not over the sidebar), 72 px, `deep`: cover, title, @handle (link), prev / play / next, scrubber with timecodes, Like, **Queue** toggle. Persists across app pages (lives in the app shell).
- **Queue panel**: from `bp-desktop` a 360 px right panel; below it a bottom sheet. Same content and Autoplay switch as Q1. Keyboard: Space play/pause (when focus isn't in a field), Shift+N next, Shift+P previous, Esc closes the panel.
- Song links on `/listen` go to `/s/{publicId}` (the same public page, now signed in: likes and reactions work directly, plus **Remix** opens the web remix panel on `/songs` with the original preloaded if the server supports remixing others' songs; otherwise "Remix in the app").
- Signed out visiting `/listen` → `/login?next=/listen`.

---

## Report (every public song)

Reuse the community Report sheet exactly (`report-sheet` component shared by gifts and songs): reasons **It uses my voice or likeness without consent** (`voice_or_likeness`) · **Copyright** (`copyright`) · **Hateful or abusive** (`hateful`) · **Sexual content involving a minor** (`minor_sexual`) · **Something else** (`other`); optional details (500), optional email; **Send report**; "Thanks. We'll review it within 24 hours." + grievance officer link. No sign-in on the web; in the app the reporter's id is attached.
Where: S1 footer and ⋯, the FP ⋯ (long-press on the title), every L1/L2 tile action sheet, W1 footer.
After reporting in the app: the song is hidden for that reporter and skipped in their queue (toast "Reported. We won't play it for you again.").
Auto-hide: 3 reports from different people within 24 h, or any `minor_sexual` report, hides the song from Listen pending review (link shows "This song is being reviewed"); the creator's card shows "Under review after reports". A person decides (same queue as gift reports).

---

## Copy

English is the source; ICU format. Hindi and Arabic are given for strings that appear on the public web page (W1) and its link preview; app strings are translated with the app later. Names and @handles in bidi isolates.

| Key | English | Hindi | Arabic |
|---|---|---|---|
| `listen.tab` | Listen | सुनें | استمع |
| `listen.hero.over` | This week | — | — |
| `listen.hero.title` | {n} new songs from creators | — | — |
| `listen.hero.sub` | Hindi, Tamil, Arabic and more | — | — |
| `listen.playAll` | Play all | — | — |
| `listen.all` | All | — | — |
| `listen.rail.new` | New | — | — |
| `listen.rail.trending` | Trending this week | — | — |
| `listen.rail.bestOf` | Best of {genre} | — | — |
| `listen.rail.byLanguage` | By language | — | — |
| `listen.seeAll` | See all | — | — |
| `listen.mine` | You have {n, plural, one {# song} other {# songs}} on Listen · {plays} | — | — |
| `listen.empty.title` | Be one of the first on Listen | — | — |
| `listen.empty.text` | Songs creators share show up here. Publish one of yours and it could be the first thing people hear. | — | — |
| `listen.empty.lang` | No {language} songs yet. Make the first one? | — | — |
| `listen.error` | Couldn't load songs. Check your internet. | — | — |
| `listen.offline` | You're offline. Connect to play songs. | — | — |
| `menu.playNext` | Play next | — | — |
| `menu.addQueue` | Add to queue | — | — |
| `menu.open` | Open song | — | — |
| `menu.notForMe` | Not for me | — | — |
| `menu.report` | Report | — | — |
| `player.from` | Playing from {source} | — | — |
| `player.autoplayFrom` | Autoplay · {handle} | — | — |
| `player.private` | Only you can hear this | — | — |
| `player.notForMe.toast` | Got it. Fewer songs like this. | — | — |
| `queue.title` | Up next | — | — |
| `queue.clear` | Clear | — | — |
| `queue.now` | Now playing | — | — |
| `queue.next` | Next up · {n} | — | — |
| `queue.remove` | Remove {title} from queue | — | — |
| `queue.removed` | Removed | — | — |
| `queue.cleared` | Queue cleared | — | — |
| `queue.undo` | Undo | — | — |
| `queue.empty` | Nothing queued. Long-press any song and pick Play next. | — | — |
| `autoplay.label` | Keep the music going | — | — |
| `autoplay.help` | When your queue ends, we'll play songs like these: same style, language or mood. | — | — |
| `autoplay.coming` | Coming up from Autoplay | — | — |
| `autoplay.off` | Music stops when your queue ends. | — | — |
| `autoplay.done` | You've heard everything new. Check back tomorrow, or make your own song. | — | — |
| `song.like` | Like | पसंद | إعجاب |
| `song.liked` | Liked | पसंद किया | أُعجبت |
| `song.notForMe` | Not for me | मेरे लिए नहीं | ليست لي |
| `song.remix` | Remix | रीमिक्स | ريمكس |
| `song.remixInApp` | Remix in the app | ऐप में रीमिक्स करें | ريمكس في التطبيق |
| `song.share` | Share | शेयर करें | مشاركة |
| `song.plays` | {n} plays | {n} बार सुना गया | {n} مرة استماع |
| `song.likes` | {n} likes | {n} पसंद | {n} إعجاب |
| `song.lyrics` | Lyrics | बोल | الكلمات |
| `song.lyrics.all` | Show all lyrics | पूरे बोल देखें | اعرض كل الكلمات |
| `song.instrumental` | Instrumental | बिना बोल का | موسيقى بلا كلمات |
| `song.more` | More like this | ऐसे और गाने | أغانٍ مشابهة |
| `song.by` | By {handle} | {handle} के गाने | من {handle} |
| `song.remixOf` | Remix of '{title}' by {handle} | {handle} के '{title}' का रीमिक्स | ريمكس لأغنية '{title}' من {handle} |
| `song.ai` | Made with AI | AI से बना | صُنع بالذكاء الاصطناعي |
| `song.ownVoice` | Sung in {handle}'s own voice | {handle} की अपनी आवाज़ में | بصوت {handle} الحقيقي |
| `song.next` | Next: {title} by {handle} in {s} | अगला: {handle} का '{title}', {s} सेकंड में | التالي: {title} من {handle} خلال {s} |
| `song.playNow` | Play now | अभी चलाएँ | شغّل الآن |
| `song.cancel` | Cancel | रद्द करें | إلغاء |
| `song.makeOwn` | Make your own song | अपना गाना बनाएँ | اصنع أغنيتك |
| `song.makeOwn.sub` | Free to start · about a minute | शुरू करना मुफ़्त · लगभग एक मिनट | البدء مجاني · دقيقة تقريبًا |
| `song.getApp` | Get the app | ऐप लें | حمّل التطبيق |
| `song.signIn.like` | Sign in to like this song | यह गाना पसंद करने के लिए साइन इन करें | سجّل الدخول للإعجاب بهذه الأغنية |
| `song.private` | This song is private now. The creator took it off Listen. | यह गाना अब निजी है। बनाने वाले ने इसे हटा लिया है। | هذه الأغنية خاصة الآن. أزالها صانعها. |
| `song.takenDown` | This song was removed after a report. | शिकायत के बाद यह गाना हटा दिया गया। | أُزيلت هذه الأغنية بعد بلاغ. |
| `song.review` | This song is being reviewed. | इस गाने की जाँच हो रही है। | هذه الأغنية قيد المراجعة. |
| `song.notFound` | We couldn't find this song. Check the link and try again. | हमें यह गाना नहीं मिला। लिंक देखें और फिर से कोशिश करें। | لم نعثر على هذه الأغنية. تحقّق من الرابط وحاول مجددًا. |
| `song.findMore` | Find more songs | और गाने खोजें | اكتشف أغاني أخرى |
| `song.audioError` | The song didn't load. Tap to try again. | गाना लोड नहीं हुआ। फिर से टैप करें। | لم تُحمَّل الأغنية. اضغط للمحاولة مجددًا. |
| `song.report` | Report this song | इस गाने की शिकायत करें | الإبلاغ عن هذه الأغنية |
| `song.og.title` | {title} by {handle} | {handle} का {title} | {title} من {handle} |
| `song.og.desc` | Listen on Reelkar. Made with AI. | Reelkar पर सुनें। AI से बना। | استمع على Reelkar. صُنعت بالذكاء الاصطناعي. |
| `react.fire` | Fire | आग | نار |
| `react.dance` | Dance | नाचने वाला | رقص |
| `react.touched` | Touched | दिल छू गया | مؤثّرة |
| `react.haha` | Haha | मज़ेदार | مضحكة |
| `react.respect` | Respect | सलाम | احترام |
| `react.celebrate` | Celebrate | जश्न | احتفال |
| `react.a11y` | {label}, {n} reactions. {selected, select, true {Your reaction.} other {}} | {label}, {n} प्रतिक्रियाएँ | {label}، {n} تفاعل |
| `publish.card.private.title` | Only you can hear this | — | — |
| `publish.card.private.text` | Publish it to Listen so anyone on Reelkar and anyone with the link can play it. | — | — |
| `publish.card.public` | On Listen | — | — |
| `publish.card.stats` | {plays} plays · {likes} likes · {reactions} reactions | — | — |
| `publish.card.removed` | Removed after a report | — | — |
| `publish.card.review` | Under review after reports | — | — |
| `publish.cta` | Publish | — | — |
| `publish.shareLink` | Share link | — | — |
| `publish.makePrivate` | Make private | — | — |
| `publish.makePrivate.title` | Make this song private? | — | — |
| `publish.makePrivate.text` | It leaves Listen and its link stops working. Plays and likes are kept if you publish it again. | — | — |
| `publish.askReview` | Ask for a review | — | — |
| `handle.title` | Pick your name on Listen | — | — |
| `handle.text` | This is how people find your songs. You can change it later. | — | — |
| `handle.help` | 3 to 20 letters (a to z), numbers, dot or underscore. | — | — |
| `handle.ok` | {handle} is yours | — | — |
| `handle.taken` | Taken. Try one of these: | — | — |
| `handle.short` | Use 3 or more characters | — | — |
| `handle.letter` | Start with a letter | — | — |
| `handle.chars` | Only a to z, 0 to 9, dot and underscore | — | — |
| `handle.reserved` | That name is reserved. Try another. | — | — |
| `handle.offline` | Can't check names offline. Connect and try again. | — | — |
| `handle.continue` | Continue | — | — |
| `publish.title` | Publish to Listen | — | — |
| `publish.field.title` | Title | — | — |
| `publish.lyrics` | Show lyrics | — | — |
| `publish.lyrics.help` | People can read along. | — | — |
| `publish.remix` | Allow remixes | — | — |
| `publish.remix.help` | Others can make a cover or remix. You're always credited. | — | — |
| `publish.remix.ownVoice` | Songs in your own voice can't be remixed. | — | — |
| `publish.note` | Your song will show Made with AI. Anyone on Reelkar, and anyone with the link, can play it. You can make it private any time. | — | — |
| `publish.ownVoice` | It's sung in your own voice. People will see "Sung in {handle}'s own voice". | — | — |
| `publish.go` | Publish song | — | — |
| `publish.blocked` | We can't publish this title: {reason}. Change it and try again. | — | — |
| `publish.checkDown` | We couldn't check your song right now, so it wasn't published. Try again in a minute. | — | — |
| `publish.done` | Your song is on Listen | — | — |
| `publish.done.text` | People can find it in New today. | — | — |
| `publish.see` | See it on Listen | — | — |
| `publish.message` | Listen to my new song '{title}' 🎶 {url} | मेरा नया गाना '{title}' सुनो 🎶 {url} | استمع إلى أغنيتي الجديدة '{title}' 🎶 {url} |
| `remix.header` | Remixing '{title}' by {handle} | — | — |
| `inbox.remixed` | {handle} remixed your song {title} | — | — |
| `report.hidden` | Reported. We won't play it for you again. | — | — |

(— = app string, translated with the app. Report sheet strings: reuse the community `report.*` keys.)

Language rules: as in the community spec (Hind line height 1.6 for Indic, no uppercase overlines in Indic/Arabic, +60% length budget, Arabic mirrors layout but not media controls, scrubber, timecodes, @handles or URLs; digits follow the device, Western by default).
Mixed-direction rails: in Arabic UI the rails start on the right and scroll left; a Hindi title inside an Arabic UI is set `dir="auto"` per tile.

---

## Components (tokens)

| Component | Spec |
|---|---|
| `SongTile` | 148 (176 web) wide; cover `radius-md`; title `label` 2 lines; meta `caption` `ink-muted`; play dot 40, `rgba(26,11,32,.72)` + white glyph, playing = `pop` + `on-pop`; rank badge 28 `pop`/`on-pop` `label`; gap `space-2`; rail gap `space-3`, side inset `space-4` |
| `SongRow` | min 64; cover 56 `radius-sm`; title `label`; meta `caption`; trailing ⋯ 44; divider `line` |
| `LanguageTile` | `surface-raised`, `line` border, `radius-md`, 84 tall, native name `title-md` (Hind / Noto Sans Arabic via the token stack), English name + count `caption` |
| `ReactionPill` | 44 tall, `radius-pill`, `line-strong` 1.5 border on `surface-raised`; selected `teal-tint` + `teal-text` border + check; emoji 18, count `label` |
| `ActionButton` (Like / Not for me / Remix / Share) | 48 target, 24 icon, `caption` label under; on = `pop` filled glyph + "Liked"; in FP colours are the player's `INK` |
| `QueueSheet` | `surface-raised`, `radius-lg` top, `elevation-2`, `scrim` behind; rows 64; Autoplay card `surface-sunken` `radius-md` `space-4` |
| `MiniPlayer` | existing; adds Next 44; subtitle "@handle · Genre" |
| `PlayerBar` (web) | 72, `deep`/`on-deep`, play 44 `pop`; scrubber track `on-deep` 14%, fill `teal` |
| `ShareOnListenCard` | `Card`; icon 40 in `teal-tint`; `Status` for On Listen / Removed |
| `HandleField` | `Field` with "@" adornment `ink-muted`; `Status` line under |
| Hero (L1, S1, W1) | `hero-start`→`hero-end` gradient, `hero-ring`, `on-brand` text, buttons on it are `deep`/`on-deep` |

No blur (the player's existing backdrop is the only heavy visual and already exists); one `elevation-2` sheet at a time; covers served at 2× tile size (300 px JPEG, ~25 KB) on rails.

## Accessibility

- Targets: 44 pt minimum; play buttons 56–76; reaction pills 44 tall.
- Contrast: `on-brand` on hero 6.5:1; Play all and web Play are `deep` on hero; chilli `action` only on `surface`/`surface-raised` (4.6:1 light, 6.2:1 dark); the play dot on covers is a solid-enough circle, `rgba(26,11,32,.72)` (as `songs/index.tsx` already uses, not the 55% `scrim`), so the white glyph is 9:1+ on any cover, even a white one.
- Never colour alone: Liked = filled glyph + word "Liked"; selected reaction = check + border; rank = number; status = icon + word.
- Screen readers: `SongTile` reads "Sufi Raat by @faiz.raat, 3 minutes 12 seconds. Plays it." with a second element "Open song page"; rails are `accessibilityRole="list"` with header; the queue's Remove reads "Remove Pind Di Kudi from queue"; Autoplay switch reads label + helper; reactions read `react.a11y`; lock screen metadata provides title and @handle.
- Announcements: when a song changes on its own (Autoplay/next), `AccessibilityInfo.announceForAccessibility("Now playing {title} by {handle}")`, only if the full player or queue is open (not while the user is elsewhere in the app).
- Font scale to 200%: rails become 1 tile + peek; tiles grow taller, never truncate the title to 1 line; the FP action row wraps to 2×2; queue rows grow.
- Reduce motion: no equaliser animation (static bars), no sheet spring (fade), no auto-advance slide (text countdown), the player's beat motion follows its existing reduce-motion handling.
- Web: all controls are buttons with names; `focus-ring` visible; queue panel is a `complementary` landmark, sheets trap focus and return it; keyboard shortcuts listed in the panel's help line.

## Edge cases

- A listener plays their own published song: plays don't count; the player shows "Your song" and no Like.
- Creator unpublishes while someone is listening: the current playthrough finishes; the next fetch of that song's audio returns 410, and queue entries are marked unavailable.
- Song deleted by the creator: same as unpublished; remixes stay with their makers, credit says "a song that's no longer public".
- Kids rhyme genre: publishable; no extra gates (no comments exist). Lyrics checked as usual.
- Very long titles (Tamil and Telugu titles can be 40+ chars): tiles wrap to 2 lines with an ellipsis, S1 hero wraps to 3; og image shrinks to fit 2 lines.
- Mixed-script titles ("Dil ki बारिश"): rendered as written, `dir="auto"`.
- One creator publishes 30 songs in a day: New shows max 2 per creator per 24 h; others are in "By @handle". Rate limit: 10 publishes per day per account.
- A handle the creator already uses on Instagram is taken on Reelkar: suggestions; no verification in phase 1 (open question 2).
- Listener on 3G: rails load 10 tiles each with 300 px covers; audio uses the 64 kbps rendition; prefetch of the next song's first 10 s starts when the current one has 20 s left.
- App killed mid-queue: the queue and position are saved locally (last 50 ids) and restored, paused, on next open.

## Build notes (one engineer)

**Data** (`src/lib/db/app-schema.ts`, then `npm run db:generate`):
- `user.handle` text unique (lowercase), `handleChangedAt`; `handle_hold` (handle, userId, until) for released handles.
- `song`: `visibility` enum `private | public` default `private`, `publicId` text unique (10 chars, same generator as gift tokens), `publishedAt`, `publicTitle` (if edited at publish), `showLyrics` bool default true, `allowRemix` bool default true, `remixOfSongId` uuid nullable (set null on delete), `moderation` enum `ok | review | removed` default `ok`, `removedReason`. Index on (`visibility`, `moderation`, `publishedAt`), (`genre`), (`language`).
- `song_play` (songId, listenerKey, day) unique; listenerKey = userId or a hashed browser id; keep a counter column `song.playCount` updated by a nightly or on-insert job for sorting.
- `song_vote` (songId, userId, value smallint +1/-1) PK (songId, userId).
- `song_reaction` (songId, userId, kind enum `fire | dance | touched | haha | respect | celebrate`) PK (songId, userId).
- Reports: generalise `gift_report` into `content_report` with nullable `giftId` / `songId` and a check that exactly one is set (new migration; the old table's rows are copied), or add a sibling `song_report` with the same enum (`giftReportReason`) if the generalisation is too big for phase 1.

**Endpoints** (Next.js):
- `GET /api/listen/home?lang=` → hero count, rails (new, trending, bestOf[]), languages with counts. Cached 60 s per lang.
- `GET /api/listen/list/[list]?cursor=` → paginated songs.
- `GET /api/listen/related?songId=&exclude=id,id&lang=` → 5 picks.
- `GET /api/songs/public/[publicId]` → public song (title, handle, genre, language, cover, lyrics if shown, counts, my vote/reaction if signed in, rails).
- `POST /api/songs/[id]/publish` {title, showLyrics, allowRemix} → runs safety checks; `POST /api/songs/[id]/unpublish`.
- `GET /api/handle/check?h=` → {ok, reason?, suggestions[]}; `PUT /api/me/handle`.
- `POST /api/songs/public/[publicId]/play` (counted per rules), `/vote` {value}, `/reaction` {kind|null}, `/report`.
- `GET /s/[publicId]` page + `opengraph-image.tsx` (copy the gift page structure: `page.tsx`, `copy.ts` for en/hi/ar, `song.module.css`).
- Audio for public songs: a public, signed, short-lived URL (no session cookie needed), so the lock screen and web player can fetch it; private songs keep the cookie route.

**Mobile:**
- `song-player.tsx`: add `queue: Song[]`, `history`, `source`, `autoplay` (persisted, default on), `next()`, `previous()`, `playList(songs, startIndex, source)`, `playNext(song)`, `addToQueue(song)`, `remove(id)`, `clear()`; listen for "did finish" to advance; fetch related when 1 left. Keep the existing API so Song Studio screens don't change.
- `Song` type gains `handle?`, `publicId?`, `visibility`, `counts?`, `myVote?`, `myReaction?`.
- New: `(tabs)/listen.tsx`, `listen/[list].tsx`, `s/[id].tsx`, `songs/remix/[publicId].tsx`, `components/queue-sheet.tsx`, `song-rail.tsx`, `report-sheet.tsx` (lift from gifts), `publish-sheet.tsx` (P1–P3).
- `tab-bar.tsx`: `ICONS.listen = "headphones"`; `icon.tsx` adds `headphones`, `queue`, `thumb-down`, `next`, `previous`.
- `app.json`: `UIBackgroundModes: ["audio"]`; universal link path `/s/*`.

**Web:** `src/app/listen/page.tsx`, `src/app/s/[publicId]/`, player bar + queue panel in `app-shell.tsx`, sidebar row.

**Order:** handle + publish/unpublish + public page (shareable value on day one) → queue + Autoplay in the player + lock screen → Listen tab rails → song page likes/reactions/rails → remix of others → web `/listen`.

---

## Open questions for the owner (with my recommendation)

1. **Tab placement.** *Recommend:* Listen replaces Earn (Earn is a placeholder; it moves to a Home card and Account until it ships). Alternatives: a Home rail only, or an entry in Song Studio. Changes PLAN decision 19.
2. **Handle rules.** *Recommend:* Latin a–z, 0–9, dot, underscore; 3–20 chars; unique; reserved list plus the real-artist block list; change once per 30 days with a 30-day hold on the old one; no verification badge in phase 1. Display names in any script come in phase 2 with creator profiles.
3. **Who sees dislikes ("Not for me").** *Recommend:* nobody sees a count publicly; the creator sees their own "Not for me" total privately on their song (useful, not humiliating), and it feeds ranking and the listener's own Autoplay. Alternative: hide from the creator too.
4. **Reaction counts.** *Recommend:* show a count per reaction once it reaches 3; below that just the emoji. Plays and likes always shown (from 1). Alternative: show no reaction counts at all.
5. **Autoplay default.** *Recommend:* on, remembered per device, with the switch one tap away in Up next. The owner's favourite thing is that it keeps going; off by default would hide it.
6. **Publishing own-voice ("Sing in my voice") songs.** *Recommend:* allowed, only by the voice's owner (consent is on record), always labelled "Sung in @handle's own voice", remixes forced off, and Report's "voice or likeness" reason auto-hides it pending review (stronger than the 3-report rule).
7. **Remixes of others' songs.** *Recommend:* allowed by default via an **Allow remixes** switch at publish (on by default, creator can turn off any time, which stops new remixes but keeps made ones); every remix credits and links the original; the original creator gets an Inbox note. Alternative: ask permission per remix (friction kills it).
8. **Moderation before publish.** *Recommend:* automatic only (existing safety checks re-run on publish), no human pre-review; 3 reports in 24 h or any minor-safety report auto-hides pending review. Revisit if reports pass 1 in 200.
9. **Punjabi as a language.** Songs are tagged with app languages (`en hi mr bn ta te ar` + Hinglish); Punjabi exists only as a genre (Punjabi pop, Bhangra). *Recommend:* add `pa` (Gurmukhi, Hind/Noto Sans Gurmukhi) to the language list for songs so "By language" has ਪੰਜਾਬੀ; until then Punjabi songs sit under Hinglish/Hindi.
10. **Public song link format.** *Recommend:* `reelkar.app/s/{10-char publicId}`, matching gifts (decision 7); no title slug (non-Latin titles make ugly URLs and titles can change).
11. **Is Listen open to signed-out people on the web?** *Recommend:* only the public song page in phase 1 (plus a read-only New rail on its "more songs" link); the full `/listen` is for signed-in users, to keep the moderation surface small at launch.
