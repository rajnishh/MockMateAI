# Home v3: your stuff in one tap, Loop, and the reel viewer (iPhone)

Builds on `design/v3.0/navigation.md` and `tokens.json` ("Masala Pop"). Mockups: `design/home-v3/mockups.html`.

**Goal.** "My reels, songs, clips and other stuff are on Home, one tap to play. A loop button plays my songs on repeat. Reels open full screen and handle like Instagram."
**Home's one job.** Get back to your own work and play it. **One primary action:** the chilli button in the Hero (Make a reel).
**Success metric.** Share of Home visits with a play (reel or song) within 10 s goes up; weekly users of Loop; median taps from launch to a playing reel is 1.

## 0. Change to an approved decision (needs sign-off)

`navigation.md` §3 says "Keep the Ask, Song Studio and Listen cards". **Proposal: remove them from Home.** All three are one tap away already (Studio tab, Listen tab, Ask in Studio > Lab). They are links to features, while the new rails show the user's own work, which is what the owner asked for. Removing them keeps Home within about 2.5 screens. Update §3 when this ships.

## 1. Home layout (top to bottom)

`Screen` (scroll) > the blocks below, 24 pt (`space-5`) between blocks. Rails scroll sideways and bleed to the right edge (left edge in RTL).

| # | Block | Shown when | Notes |
|---|---|---|---|
| 1 | Header row | always | Unchanged: "Namaste, {name}" cap + "Today" `lg`, `Credits`, bell to `/inbox` with `UnreadDot`. |
| 2 | Status card | a reel is making or waiting for a check | **One** deep-plum card (`.alert` look, `colors.deep`). Making: "Your reel is being made" / "About 2 min left", link **See it** to `/making/{id}`. Check: "Your video is ready to check", link **Check** to `reviewHref(f)`. Replaces today's `Banner` and the "See the reel being made" button. |
| 3 | `Hero` | always | Kept, but shorter: "This week · 2 of 5 reels made" + `ProgressBar onBrand` + `Button` **Make a reel** (`icon="sparkle"`, chilli, `block`). New users see **Make my first reel**. The `Win` line becomes the Hero caption ("You've made 12 reels. Keep going!"); otherwise "Free this week: 3 standard reels". |
| 4 | Next post | a post is scheduled | Unchanged `Card` > `ListRow icon="calendar"` to `/calendar`. |
| 5 | Rail **My reels** | always | See 1.1. See all goes to `/reels`. |
| 6 | Rail **My songs** | always | See all goes to `/songs`. |
| 7 | Rail **My recordings** | 1 or more | Hum clips. See all goes to `/hum/recordings`. |
| 8 | Rail **Duets and gifts** | 1 or more | Mixed, newest first. See all goes to `/inbox`. |
| 9 | Rail **My recipes** | 1 or more | See all goes to `/recipes`. |
| 10 | First week | not all 5 done | **Collapsed** to one `Card` > `ListRow icon="check"` "Your first week · 3 of 5" / next undone item ("Connect Instagram or YouTube"). Tap opens a `Sheet` with today's `CheckRow`s and their buttons. Gone once 5 of 5 are done. |

**Cut from Home:** the Ask, Song Studio and New on Listen cards (§0), the separate `Win` banner (merged into the Hero), the `Banner`/button pair for making and review (merged into block 2), and the 2×2 `ReelGrid` (replaced by the rail).
**Order, and why:** reels are the product; songs come next because they feed Loop; then clips, people, and recipes, in order of how often each is reused. Rails with nothing in them (7–9) are hidden, because they're reachable from Studio, so a new user sees a short Home.

### 1.1 Rails and cards

New `components/rail.tsx`: `Rail({ title, onSeeAll, loading, error, onRetry, children })`. The header is `Txt variant="md" accessibilityRole="header"`, with "See all" (`Txt label tealText` + `Icon right` 16, flipped in RTL) in a Pressable at least 44×44 pt. The body is a horizontal `ScrollView`, `gap: 12`, `contentContainerStyle` padding 16 on the end side, `showsHorizontalScrollIndicator={false}`. `SongRail` keeps its API but uses `Rail` for its header. Each rail shows the 10 newest items; "See all" appears only when there are more than 3.

| Rail | Card (new, in `rail.tsx` unless noted) | Shows | Tap | Long-press (and a11y action) |
|---|---|---|---|---|
| My reels | `ReelCard`, 112 pt wide, `ReelThumb width={112} seed={i} duration="0:30"` | Thumb, title (`label`, 2 lines), `filmStatus(f)` chip under it | Ready: opens the **viewer** (§3) on this reel, with the rail's ready reels as the list. Making: `/making/{id}`. Review: `reviewHref(f)`. | Delete (`confirmDelete`) when `canDelete(f)` |
| My songs | `OwnSongCard`, 128 pt, `SongCover size={128} radius={radius.lg-2}` | Cover, title (2 lines), "3:12 · Hindi". Playing: 2 pt `action` ring + a small mint "Playing" chip on the cover. Making: `Status kind="making"` "Making…", not tappable. | `player.playList(readySongs, i)`: plays in the shared player, and the rest of the row becomes the queue. Tapping the one that's playing pauses or resumes it. | `ownSongMenu` (an `Alert` like `songMenu`): Loop this song · Play next · Add to queue · Open song (`/songs/{id}`) · Gift it (`/gift/{id}`) |
| My recordings | `ClipCard`, 160×88 pt `Card` (`surface-raised`, `radius-md`) | `Icon mic` in a 36 pt `teal-tint` circle, title or `KIND_LABEL[kind]`, "0:24 · Humming · 3 Nov" | Plays in the shared player via `trackOfRecording(r)` (§2.4) | Make something with it (today's `open(r)`: `hum.recording` + `currentTake.set`, then `/hum/confirm`) · Delete |
| Duets and gifts | `TogetherCard`, 160×112 pt `Card` | Duet: two 28 pt initial avatars, topic, phase line ("Waiting for Arjun", "Ready to post", "Sing your part"). Gift: `Icon gift`, "To Maa · Birthday", song title, "Opened · played 4 times". | Duet: `/duets/{id}`. Gift: plays its song (`songId`, from the songs data) in the shared player; if that song isn't loaded or ready, opens `/songs/{songId}`. | Gift: Send again on WhatsApp (`sendOnWhatsApp(giftMessage(...))`) · Copy link (`copyLink`) |
| My recipes | `RecipeTile`, 112 pt, 9:16 poster (`api.recipePosterUrl`, otherwise `ReelThumb`) | Poster, name (2 lines), "38 uses" | `/recipes/{publicId}` | none |

**Data** (each rail loads on its own with `useData`, so one failure doesn't block the rest): `api.films()` (already loaded), `api.songs()` (ready ones are those with `audioUrl`), `hum.recordings()`, `api.duets()` + `api.gifts().sent`, `api.recipeList({ maker: profile.handle })` (skipped when there's no handle). While a song is making, poll songs every 5 s, the same as `/songs`.

**Empty states** (only the two rails that are always shown):
- My reels, empty: no rail. The Hero button already says "Make my first reel". Below the Hero, a single cap line: "Your reels will show up here."
- My songs, empty: one `Card` row in place of the scroller: `Icon music` + "Make a song in your language" / "Ready in about 2 minutes", with `Button kind="secondary" small` **Make a song** going to `/songs/new`. It's secondary, so the Hero stays the only primary action.

**Loading.** Each rail shows its header plus 3 skeleton cards in its own card shape. Add `width` and `plain` (no animated logo, which saves CPU on low-end phones) to `Skeleton`. No spinners.
**Error.** In place of the scroller, one row: `Txt cap` "Couldn't load your songs." + `Button kind="ghost" small` **Retry**. If cached data is already showing, keep it and show nothing.
**Offline.** Rails that have data keep it. Playing a song that isn't cached shows the shared player's existing error.
**RTL/long strings.** Rails mirror (start on the right). Card titles get 2 lines and captions 1 line with ellipsis. At AX text sizes, cards keep their width and grow in height; "See all" can drop under the title.

## 2. Loop: one player, a pill when idle

There is still **one player** (`SongPlayerProvider`). `MiniPlayer` becomes `PlayerBar` (same file, renamed export, rendered in the same slot in `(tabs)/_layout.tsx` and `songs/index.tsx`). It has two states:

| State | Where | Looks | Tap | Long-press |
|---|---|---|---|---|
| **Idle**: nothing loaded, the user has 1 or more ready songs | **Home tab only** | A 48 pt pill on the end side, 12 pt above the tab bar: deep plum (`surface-overlay` in dark), 32 pt mint circle with `Icon repeat` (`on-teal`), label **Loop my songs** (`label`, `on-deep`). It doesn't cover content: the slot reserves 60 pt. | Plays all ready songs, newest first, with **Repeat all** on | Opens the **Loop sheet** |
| **Playing** | every tab, as `MiniPlayer` today | Today's bar, plus: when repeat is on, a 20 pt mint badge with `repeat` or `repeat-one` on the cover's corner, and the subtitle reads "Looping · 6 songs" or "Looping this song". Play button shows `PauseGlyph`. Mint progress line. | Opens the full player `/songs/play/{id}` | Opens the **Loop sheet** |
| **Paused** | every tab | Same bar with `PlayGlyph`; the progress line stays still | Opens the full player | Loop sheet |

- The bar's right button: **Next** when `upNext.length` or repeat is All, otherwise **×** (Stop). Targets: play 44 pt, next/× 44 pt.
- No ready songs: no pill at all. Their place goes to the empty songs card (§1.1).

### 2.1 Loop sheet (`Sheet`)
Title "Loop" (`md`). Rows (`ListRow`):
1. `repeat` **Loop all my songs** / "{n} songs, newest first": plays all ready songs, Repeat all.
2. `repeat-one` **Loop one song**: shows the song list (`SongPlayerRow` per song) right in the sheet; tapping one plays it with Repeat one.
3. Shown when something is loaded: a **Repeat** `ChipRow`, Off · All · One (the same state as the full player), and `stop` **Stop playing** (`player.stop`).

### 2.2 Repeat in the full player (`songs/play/[id].tsx`)
- New `RoundButton` (44 pt) in the **left slot of the transport row**, which is an empty spacer for your own songs today. Tapping cycles **Off → All → One**. Icon: `repeat` (muted ink) for Off, `repeat` in the accent colour for All, `repeat-one` in the accent colour for One. Label: "Repeat: off / all songs / this song". VoiceOver hears "Repeat, all songs, button".
- For public songs that slot holds "Not for me". There, Repeat appears as the same `ChipRow` at the top of **Up next** (`/listen/queue`), above the Autoplay switch. It works the same everywhere; only the place to find it differs.
- When Repeat is on, Autoplay doesn't add picks. The Autoplay row shows the cap "Off while Repeat is on".

### 2.3 Player changes (`song-player.tsx`, `listen-queue.ts`)
- State `repeat: "off" | "all" | "one"`, saved under `listen.repeat`. New: `setRepeat(r)` and `loop(songs, start, mode)`, which does `playList` plus `setRepeat`.
- **One:** on `didJustFinish`, `seekTo(0)` then `play()`. **All:** when the last item finishes, `Q.skipTo(q, 0)` (add a pure `wrap(q)` to `listen-queue.ts` with a test; the web copy `src/lib/listen-queue.ts` must stay identical). Next on the last item wraps to the first. Previous on the first item restarts the song.
- Lock screen next/previous respect Repeat. The Autoplay effect skips when `repeat !== "off"`.

### 2.4 Clips in the shared player
`trackOfRecording(r: Recording): Track` builds a Song-shaped track: `id: "rec:"+r.id`, `title`, `durationSec`, `genre: "recording"`, `audioUrl: "/api/voice/takes/{id}/audio"`. That way `source()` adds the session headers with no other change. Key: `own:rec:{id}`. In the full player, when the id starts with `rec:`, use `player.song` and don't call `api.song`. Hide lyrics, votes and share. The cover falls back to the `mic` glyph art. Follow-up: `hum/recordings.tsx` should drop its own `useAudioPlayer` and use this too (one player).

## 3. Reel viewer: full screen, Instagram-style

**Route** `app/(app)/watch/[id].tsx` (`/watch/{id}`), `presentation: "fullScreenModal"`, `animation: "fade"`. The list it was opened from goes in `lib/viewer-list.ts` (`viewerList.set(films, from)`, `get()`, `clear()`, the same pattern as `duetPart`). A deep link with no list opens just that reel. Open it from: Home's reel rail, `ReelGrid` (replacing its inline play, on `/reels` and You), and the `/reel/{id}` player (tap the video to go full screen).

**Structure.** Black background (`#000`, the video area only). A vertical `FlatList` with `pagingEnabled`, `getItemLayout` (full window height), `windowSize={3}`, `initialScrollIndex`. **Only the current page mounts a `useVideoPlayer`**; the next one preloads paused, and the others show `ReelThumb` art. That's at most 2 players on 2–3 GB phones. `VideoView nativeControls={false}`, `contentFit` from state, `p.loop = true` (no auto-advance).

### 3.1 Gestures (`react-native-gesture-handler` + Reanimated)
| Gesture | Does | Feedback |
|---|---|---|
| Swipe up / down | Next / previous reel in the list | Paging snap. At either end, a rubber-band bounce (none with Reduce Motion). |
| Swipe left | Opens this reel's menu (`/reel/{id}`: Post it, caption, schedule, edit); the reel pauses underneath | Standard push |
| Swipe right | Back to where the viewer was opened from | Standard close |
| Single tap (`Gesture.Exclusive(double, single)`) | Pause / resume | 72 pt round icon in the centre (`scrim` fill, white `PlayGlyph`/`PauseGlyph`): fades in over 120 ms, holds 500 ms, fades out over 200 ms. While paused, a small play icon stays. |
| Double tap | Toggle **Fit** (`contain`) / **Fill** (`cover`, the default) | A chip at the top: "Fit to screen" / "Fill screen", for 1 s. The choice is remembered for the session. |
| Pinch | Zooms 1×–4× around the focal point; two-finger pan while zoomed | On release, springs back to 1× (`withSpring`, damping 20). Paging is off while scale > 1. |
| Press and hold | Pauses while held and hides the overlay | Resumes on release (Instagram's "hold to look"). |

### 3.2 Overlay (always on; hidden only while holding)
- **Top:** **Close** `Icon close`, 44 pt `scrim` circle on the leading side. **Sound** button on the trailing side: `volume` / `mute`, same size.
- **Right column** (bottom, 44 pt each, 16 pt apart, icon over a `cap` label): **Share** (`shareReel`, which copies the caption first, as on `/reel/{id}`), **Post** (`send`; closes the viewer, then opens `/reel/{id}`, where Post it and Caption live), **More** (`more`).
- **Bottom-left:** title (`label`, `#fff`, up to 3 lines), meta `cap` "0:30 · Hindi · **Made with AI**" (always shown) and "Recipe by @maker" when there is one. Behind it, an SVG `LinearGradient` scrim, transparent to `rgba(0,0,0,.6)`, 200 pt tall. No blur.
- **Progress:** a 3 pt bar at the very bottom, above the home indicator. Track `rgba(255,255,255,.3)`, fill `teal`, not interactive.
- **More sheet** (`Sheet`): Save to Photos (`saveReelToPhotos`) · Fit to screen / Fill screen · Fine-tune effects (`/edit/{id}`, only when `format === "edit"`) · Post or schedule (`/reel/{id}`) · Delete reel (`kind="danger"`, `confirmDelete`, then go to the next reel or close).

### 3.3 Sound
- The mute choice is saved under `viewer.muted` and carries across reels and visits. The default is sound on.
- Sound on: when a reel plays, the shared song player is paused (one sound at a time, `doNotMix`). If the viewer paused it, the song resumes on close.
- Muted: the Loop song **keeps playing** under the muted reel (watch your reels to your own music).
- Silent switch: video sound plays anyway, as songs do today.

### 3.4 Accessibility
- The page is one element: `accessibilityRole="adjustable"`, label "{title}, reel {i} of {n}, {playing|paused}{, muted}". **Swipe up/down with VoiceOver** (increment/decrement) moves to the next/previous reel. `accessibilityActions`: activate = Play/Pause, `magicTap` = Play/Pause, plus custom actions "Next reel", "Previous reel", "Fit to screen"/"Fill screen", "Mute"/"Unmute", "Share", "More". `onAccessibilityEscape` closes. Announce "Paused" / "Playing" / "Reel 3 of 8".
- Buttons: "Close", "Mute"/"Unmute", "Share", "Post it", "More options". All targets are at least 44 pt, with `hitSlop` so they reach 48 pt.
- **Reduce Motion** (`useReducedMotion`): no centre-icon scale, no rubber band, no zoom spring (snaps back in 0 ms). Next/previous from actions **crossfade** over 200 ms (`scrollToIndex({ animated: false })` under an opacity fade) instead of sliding.
- Text scales to 200%. The right column stays one column, and labels hide at AX sizes (the a11y labels stay). White text on the scrim is at least 7:1, and icon circles on any frame at least 3:1.

### 3.5 Errors and edge cases
Video fails: art + "Couldn't play this reel." + **Try again**. Offline: the same message, saying "You're offline". A reel deleted elsewhere is skipped. A list of 1: no paging. Making/review reels never enter the list. Android back closes the viewer; RTL mirrors the top buttons and the right column moves to the left.

## 4. New icons (`icon.tsx` `PATHS`, 24 grid, stroke 2)
```
repeat: '<path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>',
"repeat-one": '<path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/><path d="M11 10h1v4"/>',
volume: '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>',
mute: '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M22 9l-6 6M16 9l6 6"/>',
more: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
```

## 5. Copy (keys)
`home.status.making.{title,sub,cta}` "Your reel is being made" / "About {n} min left" / "See it" · `home.status.check.{title,cta}` "Your video is ready to check" / "Check" · `home.hero.cta` "Make a reel" · `home.hero.ctaFirst` "Make my first reel" · `home.rail.{reels,songs,clips,together,recipes}` "My reels" / "My songs" / "My recordings" / "Duets and gifts" / "My recipes" · `home.rail.seeAll` "See all" · `home.rail.error` "Couldn't load your {thing}." · `home.reels.empty` "Your reels will show up here." · `home.songs.empty.{title,sub,cta}` "Make a song in your language" / "Ready in about 2 minutes" / "Make a song" · `home.week.title` "Your first week · {n} of 5" · `loop.pill` "Loop my songs" · `loop.sheet.{title,all,allSub,one,stop}` "Loop" / "Loop all my songs" / "{n} songs, newest first" / "Loop one song" / "Stop playing" · `loop.bar.{all,one}` "Looping · {n} songs" / "Looping this song" · `player.repeat.{off,all,one}` "Repeat: off" / "Repeat: all songs" / "Repeat: this song" · `player.repeat.autoplayOff` "Off while Repeat is on" · `viewer.{close,mute,unmute,share,post,more}` "Close" / "Mute" / "Unmute" / "Share" / "Post" / "More" · `viewer.{fit,fill}` "Fit to screen" / "Fill screen" · `viewer.ai` "Made with AI" · `viewer.error` "Couldn't play this reel." · `viewer.retry` "Try again" · `viewer.a11y.page` "{title}, reel {i} of {n}, {state}" · `viewer.a11y.{next,previous}` "Next reel" / "Previous reel". Hindi check: "मेरे गाने लूप करें" fits the pill at 200%, since the pill grows in width up to 70% of the screen and then wraps to 2 lines.

## 6. Acceptance criteria
- [ ] Home shows, in order: header, status card (when needed), Hero, Next post, My reels, My songs, then the clips, together and recipes rails only when they have items, then the collapsed first-week card. Ask, Song Studio and Listen cards are gone (after §0 sign-off).
- [ ] One tap on a ready reel opens the viewer on that reel. One tap on a song or clip plays it in the shared player, and the bar appears within 1 s. Each "See all" opens the route in the table.
- [ ] Each rail has skeleton, error + Retry and empty behaviour as specced. With no data at all, Home is no longer than 1.5 screens on an iPhone SE.
- [ ] Idle Loop pill only on Home, only when there are ready songs. Tap loops all; long-press opens the Loop sheet. There is never more than one bar or player on screen.
- [ ] Repeat One replays the song; Repeat All wraps from last to first, including from the lock screen. Repeat is saved across launches. `listen-queue.ts` stays identical on web and mobile (test passes).
- [ ] Viewer: swipe pages within the opening list. Tap pauses with the centre icon. Double tap toggles Fit/Fill. Pinch zooms and snaps back. Hold pauses. Mute is remembered across reels and app launches. At most 2 video players exist at a time.
- [ ] VoiceOver: the adjustable swipe changes reels; every gesture has a custom action; magic tap toggles play; escape closes. With Reduce Motion on, actions crossfade.
- [ ] All targets are at least 44 pt. Contrast passes in light and dark. Arabic mirrors rails, pill side and viewer controls. Hindi strings fit at 200%.
- [ ] `npx tsc --noEmit && npx expo lint` in `mobile/`; `npm run typecheck && npm test` in `story-film/`.
