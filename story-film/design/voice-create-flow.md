# Hum it: voice-first create (iPhone, Expo)

Status: spec v1, 2026-11-05. Design system: v3.0 Masala Pop (`design/v3.0/tokens.json`, `mobile/src/theme/tokens.ts`).
Builds with `mobile/src/components/ui.tsx` (`Screen`, `Header`, `Hero`, `Card`, `Button`, `ChipRow`, `Field`, `Banner`, `ProgressBar`, `Status`, `Win`, `Credits`, `Skeleton`) plus the `Stepper` from `songs/[id].tsx` (move it to `ui.tsx`).

## Name

| Option | Why | |
|---|---|---|
| **Hum it** | 2 words, says the magic part (no lyrics needed); a light Hinglish pun ("hum" = we) | **Pick** |
| Bolo | Hindi "say it": warm for India, means nothing in the Gulf | |
| Just hum it | The working name; one word longer than it needs to be | |

Tagline everywhere it's introduced: **"Hum, sing or just say it."**

## Frame

- **Goal:** turn a tune or a sentence into a song, reel or music video without typing or choosing settings.
- **One job per screen:** Record = capture; Confirm = check before paying; Making = wait calmly; Mix = make it sound right and save.
- **Success metric:** recording to tap on "Make it" in under 30 s for 70% of first tries; under 10% of people change the detected kind.

## Flow

```
Entry: Create tab tile "Hum it" · Home action grid · reelkar://create?prompt=… · Siri/Shortcuts
  └─ Record (/hum)
       ├─ first use → Pre-permission sheet → iOS mic prompt → denied → Denied state (Open Settings)
       ├─ Film yourself → system camera (≤ 60 s) ─┐
       ├─ Import a file → audio or video picker ───┤
       └─ mic: idle → recording → review (play / re-record / Use this) ─┐
                                                                         ▼
                                              uploading → analysing  (error / offline → retry, recording kept)
                                                                         ▼
  Confirm (/hum/confirm) "Here's what I heard"  ── no credits → Get credits
       └─ Make it → Making (/hum/[id]) progress ~1 min (can leave; push when ready)
                       └─ Ready: player → Mix (/hum/[id]/mix) → Save → Song / Reel detail
Deep link / Siri prompt skips Record and opens Confirm with kind = Asking, transcript pre-filled.
```

Routes (new): `src/app/(app)/hum/index.tsx`, `hum/confirm.tsx`, `hum/[id].tsx`, `hum/[id]/mix.tsx`.
`reelkar://create` already opens the Create tab: in `(tabs)/create.tsx`, if a `prompt` param is present, `router.replace("/hum/confirm?prompt=…")`.

## Screen 1: Record (`/hum`)

Layout (`Screen scroll={false}`, `space[4]` gutters, `gap: space[4]`):
1. `Header title="Hum it" sub="Make" back right={<Credits/>}`.
2. `Hero` (`brand` fill, `on-brand` text), `flex: 1`, content bottom-aligned so the mic sits in the thumb zone:
   - `Txt variant="lg" color="onBrand"`: state headline (below).
   - `Txt variant="body" color="onBrandMuted"`: state helper.
   - Level meter + timer (recording/review only).
   - **Mic button**: 112 pt circle, fill `deep`, icon `mic` 44 pt in `on-deep`; 4 pt bottom edge in `#000` at 30% (same "pressable" edge idea as `Button` primary). *Why `deep`, not `action`: chilli on saffron is under 3:1; plum on saffron is 6.5:1 in both themes.*
   - Label under the mic, `Txt variant="label" color="onBrand"`.
3. Row of two `Button kind="secondary" small` (each `flex: 1`, min height 48): **Film yourself** (icon `film`), **Import a file** (icon `download`).
4. Device-AI hint (`Banner kind="info"`, dismissable, stored in SecureStore `hum.hintDismissed`), only when idle.
5. Footer line `Txt variant="cap"` centered: "2 credits for a song · you'll see the price before anything is made".

States (headline / helper / mic label):

| State | Headline | Helper | Mic | Other |
|---|---|---|---|---|
| idle | Hum, sing or just say it | "A Punjabi wedding song about my sister" | `mic` · **Tap to start** | Film / Import enabled |
| recording | Listening… | Up to 1 minute | icon `stop` (new glyph, filled square) · **Tap to stop** | Meter live; timer `0:12 / 1:00`; Film/Import disabled; at 0:50 timer turns `action`-on-`surfaceRaised` pill "10 s left"; auto-stop at 1:00 |
| review | Got it · 0:14 | Play it back, or use it | Mic replaced by 3 controls: `play`/pause 56 pt (`deep` fill), **Record again** (`refresh`, secondary), **Use this** (`Button` primary, `action`, block, under the hero) | Primary moves to the footer |
| too short (< 2 s) | That was too short | Hum or talk for at least 3 seconds. | back to idle | `Status kind="warn"` |
| uploading | Sending… | Keep the app open for a few seconds | Mic replaced by `ReelLogo loop` 56 pt | `ProgressBar onBrand value={upload}` |
| analysing | Listening closely… | Working out if you hummed, sang or asked | `ReelLogo loop` | Indeterminate; 15 s timeout → error |
| error | Couldn't send that | Check your internet. Your recording is safe. | — | `Banner kind="error"` + **Try again** (primary) + **Record again** (ghost) |
| offline | You're offline | Your recording is saved. Try again when you're back online. | — | from `expo-network`; **Try again** disabled until online |
| denied | Reelkar can't hear you | Turn on Microphone for Reelkar in Settings. | mic shown at 40% with `lock` badge, not tappable | **Open Settings** primary → `Linking.openSettings()`; Film/Import still work |

Level meter: 24 vertical bars, 4 pt wide, 3 pt gap, 8–48 pt tall, `radius.pill`, fill `deep`, idle bars `heroRing`. Driven by `expo-audio` recorder `isMeteringEnabled` (dB → 0–1), 15 fps. Reduce motion: one static bar row whose fill width tracks level.
Timer: `Txt variant="mono" color="onBrand"`, 20 pt.

Recording: `expo-audio` `RecordingPresets.HIGH_QUALITY` → m4a mono 44.1 kHz. Film yourself: `ImagePicker.launchCameraAsync({ mediaTypes: ["videos"], videoMaxDuration: 60, cameraType: front })`. Import: `expo-document-picker` (`audio/*`, `video/*`), reject > 60 s or > 100 MB before upload ("This file is longer than 1 minute. Pick a shorter one or trim it first.").

## Permission sheets

Pre-permission (bottom sheet, `surfaceRaised`, `radius.lg` top corners, shown once before the iOS prompt):
- Title: **Let Reelkar hear you**
- Text: "Reelkar uses the microphone only while you hold a recording. Your phone works out what you said first; if it can't, the recording goes to Reelkar to understand it."
- Primary: **Allow microphone** → `requestRecordingPermissionsAsync()`, then speech-recognition permission. Secondary ghost: **Not now** (back to idle; tapping the mic shows the sheet again).
- Camera variant: **Let Reelkar film you** / "Used only when you tap Film yourself. Nothing records in the background." / **Allow camera**.
- Speech recognition denied or unavailable: no UI; server transcribes. Never blocks.

`app.json` strings: NSMicrophoneUsageDescription "Reelkar records your humming, singing or voice to make a song.", NSSpeechRecognitionUsageDescription "Reelkar understands what you said on your phone before sending it.", NSCameraUsageDescription "Reelkar films a clip of you to put a song under."

## Screen 2: Confirm (`/hum/confirm`): "Here's what I heard"

`Screen` with footer. `Header title="Here's what I heard" back right={<Credits/>}`.
`Card` (no shadow in dark), `gap: space[3]`:
1. `Txt variant="over"`: **I heard**. `ChipRow` kinds: **Humming** · **Singing** · **Asking**. Detected one preselected; under it `Txt variant="cap"`: "Not right? Tap the one you meant." Changing kind re-asks the server for a plan (`Skeleton height={120}` over the plan, never a spinner).
2. Transcript `Field multiline` (min 80 pt, `fonts.indic` auto for Devanagari):
   - Humming: label **Your tune**, read-only line "No words, just your tune · 0:14" with a 44 pt `play` button.
   - Singing: label **Your lines (you can fix them)**.
   - Asking: label **You said (you can fix it)**.
3. Divider (`line`), then `Txt variant="over"`: **I'll make**.
   - Hum/Sing: `Txt variant="md"`: "A **Bollywood romantic** song on your tune". `ChipRow` Style (`GENRES`), `ChipRow` Language (`SONG_LANGUAGES`), `Field` **Title** (prefilled by server, max 80). Singing keeps the user's lines as lyrics; Humming lets AI write lyrics (show `Txt cap`: "AI writes words to fit your tune.").
   - Asking: `ChipRow` **Song · Reel · Music video**, `Field` **About** (topic), `ChipRow` Language, `ChipRow` Length (30 s / 1 min, plus 2 min for Song), Style chips for Song and Music video only.
4. `Txt variant="cap"`: "Marked as made with AI. Songs can't copy real singers or bands."

Footer: `Button primary block icon="sparkle"` **Make it · 2 credits** (cost from the plan response, never hardcoded), caption "About a minute · you can leave this screen". Ghost below: **Record again**.
No credits: button becomes **Get credits** (`/credits`), `Banner kind="warn" title="You need 2 credits"` text "You have 0. Get more, or make a free Standard reel instead." Disabled while the plan loads (`loading`).
Blocked prompt (named artist etc.): `Banner kind="error"` "Songs can't copy real singers. Try a style like 'Punjabi pop' instead." and the button stays disabled until the text changes.
Deep link / Siri: kind preselected **Asking**, transcript = prompt (trimmed, max 500 chars), `Banner kind="info"` "From Siri. Check it, then tap Make it." Never auto-starts; credits are only spent on the button tap.

## Screen 3: Making and result (`/hum/[id]`)

- `Header title={title} sub="Hum it" back`.
- Making: `Hero` with `ReelLogo loop` 64 pt, `Txt lg color="onBrand"` **Making your song…**, `ProgressBar onBrand` from job progress, steps as `Status kind="making"`: "Reading your tune" → "Writing the words" → "Singing it" → "Mixing". Caption "About a minute. We'll tell you when it's ready." Secondary **Go to Home**. Uses the existing `making/[id].tsx` polling.
- Ready: `Win text="Your song is ready"`; player card (song: same player as `songs/[id].tsx`; video: `expo-video` 9:16, `radius.lg`). Primary **Mix and save** → Mix. Secondary **Share** (existing share), ghost **Make another**.
- Failed: `Banner kind="error"` "That didn't work. Your 2 credits are back." Primary **Try again** (same plan, re-charges only on success path), ghost **Record again**.

## Screen 4: Mix (`/hum/[id]/mix`)

`Screen` with footer, `Header title="Mix" back`. Preview player at top (sticky card, 56 pt `play` button, playhead in `mono`). Changes preview locally (two `expo-audio` players: user's take + AI song, volumes applied live); export is server-side.
Controls in one `Card`, each a `Stepper` row (52 pt high, ± buttons 48 pt):

| Row | Range / step | Default | Format |
|---|---|---|---|
| Start | 0 → end−1 / 0.5 s | 0 | `0:03.5` |
| End | start+1 → length / 0.5 s | length | `0:30.0` |
| Fade in | 0–10 / 0.5 s | 0 | `1.5 s` |
| Fade out | 0–10 / 0.5 s | 2 | `2 s` |
| Your voice | 0–100 / 10 % | 30 % (hum) · 60 % (sing) · 100 % (video clip) | `30 %` |
| AI music | 0–100 / 10 % | 100 % (song) · 60 % (video clip) | `100 %` |

Toggle row (RN `Switch`, `trackColor.true = tealText`, label left, 48 pt row): **Replace my voice with the AI song**. On = Your voice 0 % and that stepper disabled; off restores the last value. Hidden when the source was speech (Asking).
Footer: primary **Save** (icon `check`) → saves a new copy, then `router.replace` to the song (`/songs/[id]`) or reel (`/reel/[id]`). Caption "Free · saves a new copy, keeps the original". Video clip source: caption "Saves a video with the AI song under your clip."
Error: `Banner kind="error"` "Couldn't save the mix. Check your internet and tap Save again." (settings kept).

## Device AI (optional, never required)

- **Deep link** `reelkar://create?prompt=<urlencoded>` → Confirm (above). Logged-out: sign in, then continue to Confirm.
- **Siri / Shortcuts**, one pass: no native App Intent yet. Ship a help sheet that walks through a Shortcut ("Make a Reelkar song about…" → Ask for text → Open URL `reelkar://create?prompt=[text]`) with **Copy link** (`expo-clipboard`). Later: a real App Intent phrase "Make a Reelkar song about …" (needs a native target).
- Hint on Record (idle only): `Banner kind="info"` title **Say it to Siri** text "Set up "Make a Reelkar song about…" to start from anywhere." action `Button kind="ghost" small` **Show me**; a 48 pt close button (`accessibilityLabel="Hide this tip"`).

## Haptics (`expo-haptics`, new dependency; skip all when the system setting is off)

Start recording `impactAsync(Medium)` · stop `impactAsync(Light)` · 10 s left `selectionAsync` · auto-stop at 1:00 `notificationAsync(Warning)` · analyse done `selectionAsync` · Make it `impactAsync(Medium)` · song ready `notificationAsync(Success)` · any error `notificationAsync(Error)` · Stepper/Chip `selectionAsync`.

## Accessibility

- Mic: `accessibilityRole="button"`, label idle "Record. Hum, sing or say what you want", recording "Stop recording, 12 seconds", `accessibilityHint` "Records up to 1 minute". Announce state changes with `AccessibilityInfo.announceForAccessibility` ("Recording", "Stopped. 14 seconds", "I heard singing").
- Level meter `accessibilityElementsHidden`; timer is the accessible value. Bars are never the only feedback: headline + timer change too.
- Kind chips: `radiogroup`, each "Humming, detected" when it's the server's guess.
- Stepper: `adjustable` with `onAccessibilityAction` increment/decrement (add to the moved `Stepper`). Switch label is the full sentence.
- Targets: mic 112, play 56, everything else ≥ 48 (`size.tapMin`); Chip min height 38 gets `hitSlop` 5 to reach 48.
- Contrast: `on-brand` on `brand` 6.5:1, `on-deep` on `deep` ≥ 13:1, `action`/`on-action` buttons per tokens; disabled states keep text, not colour only.
- Font scale 200%: Hero headline `numberOfLines` unset, Hero scrolls if needed; button labels wrap (no fixed widths). Long Hindi labels (60% longer) wrap chips to a second row.
- RTL (Arabic UI later): meter grows from the leading edge; Start/End and ± stay in reading order via `flexDirection: "row"` (auto-mirrors).
- Reduce motion: no pulse rings, no bar animation, `ReelLogo` static.

## Copy keys (English)

`hum.title` Hum it · `hum.tagline` Hum, sing or just say it · `hum.example` "A Punjabi wedding song about my sister" · `hum.tapStart` Tap to start · `hum.listening` Listening… · `hum.tapStop` Tap to stop · `hum.tenLeft` 10 s left · `hum.got` Got it · `hum.useThis` Use this · `hum.again` Record again · `hum.film` Film yourself · `hum.import` Import a file · `hum.sending` Sending… · `hum.analysing` Listening closely… · `hum.tooShort` Hum or talk for at least 3 seconds. · `hum.offline` Your recording is saved. Try again when you're back online. · `hum.denied` Turn on Microphone for Reelkar in Settings. · `hum.openSettings` Open Settings · `confirm.title` Here's what I heard · `confirm.kind.hum` Humming · `confirm.kind.sing` Singing · `confirm.kind.ask` Asking · `confirm.notRight` Not right? Tap the one you meant. · `confirm.plan.song` A {genre} song on your tune · `confirm.make` Make it · {n} credits · `confirm.time` About a minute · you can leave this screen · `confirm.needCredits` You need {n} credits · `make.progress` Making your song… · `make.ready` Your song is ready · `make.failed` That didn't work. Your {n} credits are back. · `mix.title` Mix · `mix.voice` Your voice · `mix.music` AI music · `mix.replace` Replace my voice with the AI song · `mix.save` Save · `siri.title` Say it to Siri.

## API contract (for the engineer, server work separate)

- `POST /api/voice/analyse` multipart `{ file, source: "mic"|"camera"|"file", transcript? (on-device), language? }` → `{ uploadId, kind: "hum"|"sing"|"ask", transcript, durationSec, plan }`. `plan = { make: "song"|"reel"|"music-video", genre?, language, title?, topic?, durationSec, credits }`. No credits spent.
- `POST /api/voice/plan` `{ uploadId? , kind, transcript, overrides }` → new `plan` (kind change or edits).
- `POST /api/voice/make` `{ uploadId?, kind, transcript, plan }` → `{ jobId, songId? , reelId? }`; 402 `needCredits` → no-credits state.
- `POST /api/songs/:id/mix` `{ startSec, endSec, fadeInSec, fadeOutSec, voiceGain, musicGain }` → new song or reel id. Free.

## Acceptance criteria

1. From the Create tab, a first-time user records, sees "Here's what I heard" and taps Make it without typing.
2. No credits are spent before Make it; the price on the button comes from the server plan.
3. Recording auto-stops at 60 s; clips under 2 s never upload.
4. Mic denied: Film yourself, Import and Open Settings still work; the app never re-prompts in a loop.
5. Offline or failed upload keeps the recording and offers Try again.
6. Deep link with `prompt` lands on Confirm with Asking selected and never auto-makes.
7. Mix preview reflects volume, trim and fade changes within 200 ms; Save keeps the original.
8. VoiceOver can complete the whole flow; all targets ≥ 48 pt; layout holds at 200% text and in dark mode.

New dependencies: `expo-haptics`, `expo-document-picker`; optional `expo-speech-recognition` (dev build). New icon glyphs: `stop`, `camera` (Lucide).
