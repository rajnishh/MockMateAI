# Quick create: the instant camera button and the chilli fan (v3.0, proposed 2026-11-07)

**Problem.** The chilli Create button only switches to the Create tab, so every start takes 2 or more taps and a scroll. The owner wants (a) a floating button that opens the camera instantly, like Instagram Instants but better, and (b) a chilli button that opens a ring of quick options.
**Decision (recommended).**
1. **Chilli tap opens the Arc fan (direction A):** 5 makers on a semicircle above the button, plus "All makers" in the middle. Long-press still opens Film (`capture.md` 1).
2. **Instant button, option B "Snap & suggest":** a 56pt camera bubble at the bottom trailing corner of **Home and Listen only**. It opens the system camera, then goes to `/capture`, where the best fit is ranked first with a reason ("Your clip is 9 s: perfect for Copy my moves").
3. Both ship **over the air** in Phase 1. No `app.json` change, no new native module.
**Success metric.** Taps from app open to camera or maker: 2 or fewer for 80% of starts. The share of new reels started from the fan or the instant button reaches 40% within 4 weeks. The fan is dismissed with nothing chosen under 35% of the time.

Doesn't change `navigation.md`: the 5 tabs, routes and the chilli's place stay. It changes only what a chilli **tap** does (today: switch to Create). Update `navigation.md` 1 when this ships.

## 1. Research: how others do quick capture

| App | Entry | What happens next | Steal / avoid |
|---|---|---|---|
| Instagram Instants (May 2026) | Small photo-stack button, lower right of the DM inbox | Camera opens at once, live photo only, no edits, undo after send | Steal: one tap, lower right. Avoid: no next step, nothing to make |
| Snapchat | App opens on the camera | Lenses, then send | Steal: speed. Avoid: camera as home (wrong for our budget phones, cold start) |
| BeReal | Daily push, 2 min window | Front + back photo | Steal: a timely prompt (we use festivals) |
| TikTok | Centre + tab | Full camera with templates | Steal: templates next to the shutter. Avoid: dense camera UI |
| Locket | Home-screen widget | Photo straight to friends | Later: an iOS widget needs a new build |

Takeaway: everyone makes *capture* instant; nobody helps you decide *what to make* with it. That's our edge, and it's what `/capture` already does.

## 2. Instant button: three options

| | Pitch | Flow | Needs |
|---|---|---|---|
| **A. Plain instant** | Instagram's button, our colours | Tap: system camera (video, front, 60 s). Then `/capture` as it is today. | OTA. `expo-image-picker` (installed). |
| **B. Snap & suggest** (pick) | "Shoot first, Reelkar tells you what it can become" | Tap: camera. Then `/capture` with options re-ordered by fit, top one marked **Best fit** with a one-line reason, and a festival chip when one is near (Diwali, Eid, Onam, Pongal, Ramadan nights). | OTA. Ranking is on-device rules (length, photo/video, face count unknown so skip, date). No server change. |
| **C. One-tap moment** | "Shoot, and the reel makes itself" | Tap: camera. Then skips the chooser: a 3 s sheet "Making a Diwali reel with your clip · ₹0 · 2 min. **Change**" and the job starts. | OTA for UI, but a **new server preset** (auto maker per festival) and a price-before-commit risk. Phase 2. |

Why B: it keeps the trust rule (price shown before you commit) that C bends, and it's what A lacks. C can grow out of B once we see which "Best fit" people accept.

**Festival chip.** A local table `mobile/src/lib/festivals.ts` (date ranges, name per language, region IN/GCC). Chip on `/capture`: "Make it a Diwali reel" / "दिवाली रील बनाएं" / "اجعله ريل عيد". It prefills the story maker's theme. No server call.

### 2.1 Placement and safe areas
- 56pt circle (`action` fill, `on-action` camera icon, 2pt `surface` ring so it reads on any content). Target 56pt, above the 44pt minimum.
- Bottom: tab bar top + 12pt. If the MiniPlayer is showing, sit above it + 12pt. Read the bar height with `useBottomTabBarHeight()` plus the MiniPlayer's height from its store. Never inside the home-indicator inset.
- Side: 16pt from the **trailing** edge (right in LTR, left in Arabic: `end: 16`). A **Left-handed** switch in Settings ("Camera button on the left") flips it. Default trailing because the right thumb reaches bottom right on every size, SE to Pro Max.
- Scroll: shrinks to a 44pt circle while scrolling down, grows back on scroll up or stop (Reanimated, transform only). Reduce Motion: no shrink, stays 56pt.

### 2.2 Where it shows
| Shows | Hidden |
|---|---|
| Home, Listen | Create (the Film·Snap·Gallery strip already does it), Studio (dense lists, would cover row actions), You, every pushed screen, `/capture`, `/making/*`, players, sheets and the fan when open, sign-in, onboarding |

With VoiceOver on it stays visible but comes last in focus order, labelled "Film now".

### 2.3 Hand-off
Tap: haptic `impactLight` → permission check (`capture.md` 6) → `launchCameraAsync` video, front, 60 s → capture store `{ source: "instant" }` → push `/capture?from=instant`. Cancel returns to the same scroll position. Long-press the instant button: Snap (photo). Analytics `instant_open`, `instant_captured`, `instant_best_fit_taken`.

## 3. Chilli fan: three directions

Items (Phase 1, five plus "All makers"):

| # | Label | Icon | Goes to |
|---|---|---|---|
| 1 | Make a reel | `film` | `/create?kind=story` |
| 2 | Make my song | `music` | `/songs/new` |
| 3 | Hum it | `mic` | `/hum` |
| 4 | Edit my video | `video` (new, `capture.md`) | `/edit` |
| 5 | Music video | `sparkle` | `/songs/video` |
| centre | All makers | `grid` | Create tab (today's behaviour) |

Kids dance, Ask Reelkar and Brand stay one tap deeper on the Create tab. **Max 6 items on the arc** (5 + All): on an SE (375pt) a 6-slot semicircle at radius 118pt gives 56pt discs with labels that don't collide; 7 or more forces labels to overlap or wrap at 200% text. Owner can swap which 5 via remote config later (open question 2).

| | Pitch | Motion | Fit |
|---|---|---|---|
| **A. Arc fan** (pick) | "Spices thrown from the chilli" | 5 discs fly out on a 180° arc above the button, 30 ms stagger, spring. Chilli `+` rotates to `×`. Scrim `scrim`. | Thumb-friendly: every disc is within the bottom 40% of the screen. Feels like ours. |
| **B. Bloom sheet** | "A tiffin that opens" | A deep-plum panel grows out of the chilli into a 2×3 tile grid (icon + label + one-line hint, price "from ₹0"). | Most readable, best for long Hindi/Tamil labels and 200% text, room for hints. Less playful. |
| **C. Rangoli ring** | "A full circle around your thumb" | 6 discs on a full ring centred 140pt above the chilli, petals drawn with `react-native-svg`. | Prettiest, but the top discs land mid-screen (hard reach on Pro Max) and it's the hardest to make accessible. |

Fallback inside A: when text size is AX1 or larger, or labels don't fit, A renders as B automatically. So B is built anyway.

### 3.1 Tap, long-press and the instant button
- **Tap** chilli: open the fan (haptic `selection`). Tap again, tap the scrim, swipe down or Back: close.
- **Long-press** (500 ms): Film directly, haptic `impactMedium`. Unchanged from `capture.md`.
- **Press and slide** (bonus, A only): hold, slide onto a disc, release to open it, like iOS app-icon menus. Optional; plain tap always works.
- **Instant button vs fan:** keep both, no overlap in job. The fan answers "what do I want to make?"; the instant button answers "something's happening, film it now". The fan **doesn't** include a camera disc (long-press covers it on every tab, the instant button on Home and Listen). If the owner wants one control only: drop the instant button, put **Film** as disc 1. Don't do the reverse (the chilli is the brand mark).

### 3.2 Accessibility
- Chilli: `accessibilityLabel` "Create", `accessibilityHint` "Opens quick options. Double-tap and hold to film." `accessibilityState.expanded`.
- When open: focus moves to disc 1; discs are `button`s in reading order (start of arc to end); scrim gets "Close" as the last item; `accessibilityViewIsModal`; magic tap / two-finger Z closes.
- VoiceOver on: long-press isn't discoverable, so add an `accessibilityActions` entry "Film now".
- Reduce Motion (`useReducedMotion`): no fly-out or rotation; discs fade in place over 150 ms.
- Discs 56pt with label below (12pt semibold, `maxFontSizeMultiplier` 1.6). Labels sit on a `surface-overlay` pill so they pass 4.5:1 over the scrim in both themes.
- Never colour alone: each disc has icon and words.

### 3.3 RTL and sizes
- Arc order follows reading direction: disc 1 on the start side (left in LTR, right in Arabic). Chilli stays centred.
- SE (375×667): radius 118pt. 390–430pt widths: radius 128pt. Arc top must stay 24pt below the status bar in landscape-locked portrait; we're portrait-only.
- Long strings: labels wrap to 2 lines max, then the B fallback.

## 4. "Create or endorse a brand": what would be new

Today we have Brand kit (accent, background, handle for motion reels), Recipes (shareable, earnings), Instagram Collab on duets and Connections. There's **no** brand-deal maker. A real one needs:
- A **Brand deal reel** maker: product photo or link, key message, the creator's face/voice, a call to action.
- **Ad disclosure built in:** India ASCI influencer rules (a visible "#ad / Paid partnership" label in the first frames and caption, in the post's language). UAE: the creator needs the UAE Media Council **Advertiser Permit**; we'd ask for it and show "Ad" on the reel. A consent and terms step for both sides.
- Possibly a brand marketplace (brands find creators): payments, disputes, KYC. Big.

**Recommend:** not in the fan in Phase 1. Option for the owner: a "Brand deals · Coming soon" row on Create with "Tell me when" (stores interest, measures demand). Decision is the owner's.

## 5. What each option needs

| Option | OTA? | Uses |
|---|---|---|
| Instant A / B | Yes | expo-image-picker, Reanimated, expo-haptics, safe-area-context |
| Instant C | Yes (app) + server preset | as B + new job preset |
| Fan A / B / C | Yes | Reanimated, gesture-handler (long-press, press-slide), react-native-svg (C petals), expo-haptics |
| Custom in-app camera (live preview in the button, filters) | **No, new build** (expo-camera / vision-camera + permissions strings) | Phase 2 |
| Home-screen widget / Lock Screen control (Locket-style) | **No, new build** (widget extension) | Phase 3 |

All Phase 1 libraries are in `mobile/package.json` (reanimated 4.7.1, gesture-handler ~3.3.0, expo-haptics ~58.0.7, react-native-svg 15.16.0, expo-image-picker ~58.0.10).

## 6. Components
- `TabBar` (`components/tab-bar.tsx`): the Create `Pressable` gets `onPress` → `openFan()`, `onLongPress` → `startFilm()`, `delayLongPress` 500.
- `QuickFan` (new, `components/quick-fan.tsx`): portal above tabs; props `open`, `onClose`, `items`; layout `arc | sheet`.
- `InstantButton` (new, `components/instant-button.tsx`): rendered by the Home and Listen screens, not the tab layout, so hiding is automatic everywhere else.
- `lib/festivals.ts`, `lib/capture-rank.ts` (fit rules), Settings switch `prefs.instantSide`.

## 7. Copy keys (en / hi / ar)
| Key | en | hi | ar |
|---|---|---|---|
| `quick.reel` | Make a reel | रील बनाएं | اصنع ريل |
| `quick.song` | Make my song | मेरा गाना बनाएं | اصنع أغنيتي |
| `quick.hum` | Hum it | गुनगुनाएं | دندن |
| `quick.edit` | Edit my video | मेरा वीडियो एडिट करें | عدّل فيديو |
| `quick.musicVideo` | Music video | म्यूज़िक वीडियो | فيديو موسيقي |
| `quick.all` | All makers | सब मेकर | كل الأدوات |
| `quick.close` | Close | बंद करें | إغلاق |
| `quick.a11yHint` | Opens quick options. Double-tap and hold to film. | जल्दी विकल्प खुलेंगे। फ़िल्म करने के लिए दो बार टैप करके दबाए रखें। | يفتح خيارات سريعة. انقر مرتين مع الضغط للتصوير. |
| `instant.label` | Film now | अभी फ़िल्म करें | صوّر الآن |
| `instant.bestFit` | Best fit | सबसे सही | الأنسب |
| `instant.reason.short` | Your clip is {s} s: perfect for Copy my moves | आपकी क्लिप {s} सेकंड की है: मेरे स्टेप्स कॉपी करें के लिए सही | مقطعك {s} ث: مثالي لـ«قلّد حركاتي» |
| `instant.festival` | Make it a {festival} reel | इसे {festival} रील बनाएं | اجعله ريل {festival} |
| `settings.instantLeft` | Camera button on the left | कैमरा बटन बाईं ओर | زر الكاميرا على اليسار |
| `create.brandSoon` | Brand deals · Coming soon | ब्रांड डील · जल्द आ रहा है | صفقات العلامات · قريبًا |

## 8. Acceptance criteria
1. Tapping the chilli opens the fan within 100 ms of touch-up on an iPhone 11; 60 fps (transform/opacity only, no blur).
2. Long-press 500 ms on the chilli opens the camera; it never also opens the fan.
3. Fan closes on scrim tap, chilli tap, swipe down, and after choosing; choosing pushes the route in the table in 3.
4. Every disc is 56pt or more, fully on screen on SE, 16, 16 Pro Max, in LTR and Arabic, at default and 200% text (fallback to sheet at AX sizes).
5. VoiceOver: focus moves into the fan, reads labels in order, Close is reachable, "Film now" custom action exists on the chilli.
6. Reduce Motion: no fly-out, rotation or button shrink.
7. Instant button shows only on Home and Listen, sits 12pt above the tab bar or MiniPlayer, trailing edge, flips with RTL and the left-handed switch, never covers the last list row (screens add bottom padding of 56 + 24pt).
8. Instant flow lands on `/capture` with a Best fit option and reason; prices still show on every option.
9. No change to `app.json`, no new native dependency; `npx expo-updates fingerprint` unchanged.

## 9. Open questions for the owner
1. Ship both the fan and the instant button, or only the fan with Film as disc 1?
2. Which 5 makers on the fan? Proposed: reel, song, hum, edit, music video. Kids dance instead of Music video for family accounts?
3. Brand deals: "Coming soon" row to measure interest, or keep it off the roadmap until a brand partner exists?
4. Festival chips: which festivals and regions for v1 (IN national + Tamil/Telugu/Bengali/Marathi + Eid/Ramadan/UAE National Day)?
5. Instant option C (auto-make) as a Phase 2 experiment once B data is in?
