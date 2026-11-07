# Capture first: film or snap, then choose what to make (v3.0, proposed 2026-11-07)

**Problem.** Every maker starts from a form and a gallery button. Nobody can film something first and then decide what to make, which is how creators already work in Instagram and WhatsApp. The owner asked for "direct capture image or video and add effects and make AI video song or reels, story etc".
**Decision.** Put a **Film · Snap · Gallery** strip at the top of Create. All three go to one pushed screen, **"What should we make?"** (`/capture`). It offers only the makers that fit what you shot, and shows each one's price before you tap. For video, "effects" means the Edit my video options you already have (captions, zooms, effects around you, sounds, voice). Phase 1 uses the system camera (`expo-image-picker`), so it ships over the air with no new App Store build. A custom camera and live AR filters come later and are costed in section 8.
**Success metric.** Within 4 weeks of shipping, 25% of new reels start from Film, Snap or Gallery on Create. 60% or more of captures reach a started job. Under 3% of capture uploads fail, not counting cancels.

Doesn't change any approved decision in `navigation.md`. Tabs, routes and the chilli button stay the same. The only addition to the chilli button is a long-press shortcut (section 1).

## 1. Entry points (one or two taps)

| Where | What | Taps to camera |
|---|---|---|
| **Create, first block under the Header** | Capture strip: three tiles, **Film · Snap · Gallery** | 2 (Create, then Film) |
| **Chilli Create button, long-press** | Opens Film directly, with a light haptic. It's a shortcut only, so nothing breaks if people never find it. | 1 (hold) |
| Every maker's own gallery button | Unchanged: Edit, Hum, Music video, Story photo | as today |

- **Why Create's top and not Home.** Create is where people come to make something, and the chilli button already says "make". Home's job is "what's happening with my reels" (`navigation.md` 1). If a Home entry seems worth it, see open question 3.
- **Gallery stays a full equal.** The Gallery tile picks a photo *or* a video (`mediaTypes: ["images","videos"]`) and opens the same chooser. People who filmed earlier in the system Camera get the same flow.
- The Hum it card, recipes and the kind chips stay below the strip in the same order.

**Strip layout.** A `Card` titled "Start with your camera" (`Txt variant="md"`). Below the title is a row of 3 equal tiles. Each tile is at least 96pt tall, with a 48pt icon disc above a one-word label.
- Film: icon `video` (new) on `brand`, with `on-brand`.
- Snap: icon `camera` on `teal`, with `on-teal`.
- Gallery: icon `image` (new) on `surface-sunken`, with `ink`.

Labels are 15pt semibold `ink`. Add two icons to `PATHS` in `icon.tsx` (24 grid, stroke 2):
```
video: '<rect x="2" y="6" width="14" height="12" rx="2"/><path d="M16 10l6-4v12l-6-4z"/>',
image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/>',
```
`film` isn't reused for Film, because `film` already means "a reel" (My reels, Kids dance).

## 2. Flow

```
Create ─ Film ──▶ [camera permission check, 6] ─▶ system camera (front, 60 s max, trim allowed)
       ─ Snap ──▶ [camera permission check]    ─▶ system camera (photo, front)
       ─ Gallery ─▶ system picker (photo or video, iOS export 1080p HEVC / JPEG)
            │ cancel ─▶ back on Create, nothing changes
            ▼
     /capture "What should we make?"  (clip kept in the capture store until made or discarded)
            ├─ video: Edit my video ─▶ /capture/effects ─▶ upload (progress) ─▶ /making/[id]
            ├─ video: Put a song under it ─▶ /hum?from=capture (review phase) ─▶ /hum/confirm
            ├─ video 3–15 s: Copy my moves ─▶ song sheet ─▶ /songs/video/[id]?from=capture (kind full)
            ├─ photo: Star in a story reel ─▶ /create?kind=story&from=capture (photo + AI animation set)
            └─ photo: Star in a music video ─▶ song sheet ─▶ /songs/video/[id]?from=capture (kind performance)
```

- **Capture store.** `mobile/src/lib/capture.ts` keeps one in-memory item, `{ uri, name, type, kind: "video"|"photo", seconds, mb, source: "camera"|"gallery" }`. It works like `currentTake` in `lib/hum.ts`. Destinations read it on `from=capture` and clear it once a job starts. File URIs never go in the URL.
- Hand-offs prefill the existing screens and don't fork them. The `from=capture` param tells Hum, Create and Music video to read the store. Music video also gets a kind preset. Everything else on those screens works as it does today.
- **Leaving with an unused clip** (back from `/capture`) shows a native `Alert`: "Discard this clip?" with **Keep** (cancel) and **Discard** (destructive). Gallery picks skip the alert, because the original is still in Photos.

## 3. "What should we make?" (`/capture`)

`Screen` > `Header back title="What should we make?"`, then:
1. **Preview.** A clip plays muted and looped with `expo-video`. A photo shows as `Image`. Height is `min(40% of window height, 360pt)`, about 260pt on iPhone SE and 360pt on Pro Max, with corner radius `lg`. Below it is a meta line in `Txt variant="cap"`: "24 s · 38 MB" or "Photo". Next to the meta line sit two ghost buttons: **Retake** (or **Choose another** for gallery picks) and **Remove**.
2. **Recommended maker.** The first option that fits, shown as a `Hero` with one primary button. It's the screen's one primary action.
3. **Other makers.** `Card` > `ListRow`s, each with an icon, title, one-line sub and a **price chip** in `right` before the chevron.
4. **Photos only.** A line under the list: "You'll confirm this is you, or someone who agreed. Famous people aren't allowed." This sets expectations here. The actual consent is still asked on the maker screen (section 5).

**Fit rules.** Hide any maker that doesn't fit. Never show a disabled row without a reason.

| Maker | Media | Fits when | Price chip (from data already loaded) | Recommended for |
|---|---|---|---|---|
| Edit my video | video | 3–60 s and ≤ 95 MB | "Free · {n} left this week", else "1 credit" | every video |
| Put a song under it (Hum) | video | 2–60 s and ≤ 95 MB | "1 credit" (Hum's own copy) | |
| Copy my moves into a music video | video | 3–15 s, ≤ 40 MB, and at least one finished song | "{n} credits" for the latest song at 15 s (`musicVideos.options`, kind `full`) | |
| Star in a story reel | photo | AI animation or Cinematic is on for this server | "{6 × premiumCreditsPerShot} credits · 30 s" (72 today) | every photo |
| Star in a music video | photo | at least one finished song | "{n} credits" (kind `performance`, latest song) | |

- **Front or back camera isn't a filter.** The system camera lets people flip, and the result doesn't say which camera was used. Fit is decided by type, length and size. The consent step covers "is a person in it".
- **Too long or too big.** If no video maker fits (a gallery clip over 60 s, or over 95 MB), the chooser shows `Banner kind="warn"`: "This video is 1 min 40 s. Reels can be up to 60 seconds." with **Trim it**, which reopens the picker with `allowsEditing: true`, `videoMaxDuration: 60` so iOS shows its own trimmer. For size: "This video is 140 MB. Videos can be up to 95 MB. Trim it, or film at 1080p."
- **Free left.** `GET /api/billing` already returns `freeLeft` (free reels left this week, from `freeReelsLeft`). The chip reads it; if billing hasn't loaded, it says "Free · {freeVideosPerWeek} a week".
- **Song sheet** (`Sheet`). "Which song?" lists finished songs (cover, title, length), newest first. A ghost **Make a new song** opens `/songs/new`. Picking a song refreshes that row's price before navigating.
- **Loading.** Show a `Skeleton` for each price chip. Rows show right away and their prices fill in. If the price fetch fails, the chip reads "See price" and the price shows on the next screen. Never guess a number.

## 4. Effects step (video, Edit my video) `/capture/effects`

The effects are exactly the Edit options Create already has, with the same defaults and the same `POST /api/edits`. Pull Create's edit section (lines from "Language you speak in the video" to "Check effects before rendering") out into `components/edit-options.tsx`. Create and `/capture/effects` both use it, so the two never drift apart.

- `Header back title="Add effects" sub="{24 s} video"`, then a small preview strip (88pt thumbnail and meta), then `EditOptions`: language spoken, captions, zooms, sounds, effects around you, your voice, ending, and check before rendering.
- **Footer (primary):** **Edit my video**, with the caption "About as long as your video · you can leave once it's uploaded". During upload the button becomes a `ProgressBar`, the text "Uploading {38} of {62} MB" and a ghost **Cancel**.
- **No live AR filter camera in Phase 1.** "Effects around you" (big word, spotlight, sticker cut-out, stamps) and fine-tuning on `/edit/[id]` are already the creative layer. A live filter camera is Phase 3 (section 8).

## 5. Consent, permissions, limits, upload

**Consent (rule unchanged).** A photo or dance clip of a person is never used until the creator taps **Yes, they agreed** on the maker screen. That's the existing `photoConsent` / `danceConsent` chips, with the "Not yet" default and the make button blocked until then. The server also refuses: `resolvePhoto` throws without consent and rejects Standard quality, and `dance-clip` needs `consent=true`. Capture never pre-ticks consent and never carries it from one maker to another. Story reels with a photo stay AI animation or Cinematic only. The `from=capture` preset sets `quality` to premium, or cinematic if premium isn't available. If neither is available, the story row is hidden.

**Permissions.**
| State | What happens |
|---|---|
| Camera not asked yet | Same pattern as Hum's camera sheet. A `Sheet` titled "Film with Reelkar" says "We use the camera only when you tap Film or Snap. Nothing is recorded until you press the red button." **Continue** shows the system prompt. "Not now" closes the sheet. |
| Camera denied (`canAskAgain` false) | A `Banner kind="warn"` under the strip says "Camera is off for Reelkar." with **Open Settings** (`Linking.openSettings()`) and **Choose from gallery**. The Film and Snap tiles stay tappable and bring this banner back. |
| Microphone denied (Film only) | Before opening the camera, show "Microphone is off, so your video will have no sound. Captions and songs need your voice." with **Open Settings** and **Film anyway**. |
| Photos (gallery) | iOS's limited picker needs no permission. No change. |

**Limits** (checked on the phone before any upload, so a 413 never happens):
| | Length | Size | Source of the limit |
|---|---|---|---|
| Edit my video | 3–60 s | 95 MB | `FREE_PLAN.maxDurationSec`, Cloudflare's 100 MB limit (`MAX_EDIT_MB`) |
| Hum | 2–60 s | 95 MB | Hum `MIN_SEC`/`MAX_SEC`, tunnel |
| Dance clip | 3–15 s | 40 MB | `MAX_DANCE_CLIP_BYTES`, picker's 15 s |
| Photo | n/a | JPEG | camera returns JPEG; gallery uses `Compatible` (no HEIC) |

The camera is opened with `videoMaxDuration: 60`, `allowsEditing: true` (iOS's trimmer after recording) and the same `videoExportPreset: HEVC_1920x1080` the gallery uses. On iPhone 13, check that a 60 s back-camera clip comes in under 95 MB (see acceptance criteria). If it doesn't, the size warning shows and nothing is uploaded.

**Upload.** Move `uploadEdit` (and the capture path's `uploadPhoto` / `uploadDanceClip`) from `fetch` to `XMLHttpRequest`, so `upload.onprogress` drives the bar and **Cancel** calls `abort()`. This is JS only, so it can ship over the air.
- **Failure:** `Banner kind="error"` shows the server's own message word for word (for example "Videos can be up to 60 seconds for now. Trim it and try again."), with **Try again** (re-sends the kept file) and **Save clip to Photos** (`expo-media-library`, already installed).
- **Offline or network error:** "You're offline. Connect to Wi-Fi or mobile data, then tap Try again. Your clip is kept."
- **Not enough credits:** the existing "Not enough credits" title plus **Get credits**.
- The clip stays in the capture store until a job starts, so a retry never means filming again.
- **Copy during upload:** "Stay on this screen until it's uploaded." Phase 1 doesn't do background upload (section 8).

## 6. Layout, type, themes, RTL, access

- **Small and large iPhones.** On SE (375×667) the strip tiles are about 109pt wide, and the chooser's Hero sits above the fold under a 260pt preview. On Pro Max the preview caps at 360pt. The body stays inside `screenBody` with a 720pt max width.
- **Dynamic Type.** At AX sizes, strip tiles turn into three full-width `ListRow`s (icon, label, chevron), and the chooser preview shrinks to an 88pt thumbnail row. That keeps the Hero visible. Labels wrap to 2 lines, never truncate. Price chips move under the row title.
- **Targets.** Tiles are at least 96pt tall. Rows, chips, Retake, Remove and Cancel are at least 44pt (tokens `tap-min` 48px on Android). The long-press needs 500 ms and has a VoiceOver custom action, "Film now", on the Create tab button.
- **Dark mode.** Use only tokens: tiles on `surface-raised` with a `line` border, and icon discs as listed in section 1. Price chips use `teal-tint` with `teal-text`, or `surface-sunken` with `ink` for credit prices. A chip is never colour-only: it always holds a word ("Free", "72 credits").
- **RTL (Arabic).** The tile order mirrors (Gallery, Snap, Film from the right). Chevrons and the back button flip. `ProgressBar` fills from the right. Wrap numbers and units in the meta line in a bidi isolate, so "24 s · 38 MB" doesn't scramble.
- **Reduce motion.** The preview doesn't autoplay. It shows the first frame with a play button. There's no shutter animation.
- **VoiceOver.** Tiles read "Film a video", "Take a photo" and "Choose from gallery". The preview reads "Your video, 24 seconds" or "Your photo". Rows read "{title}, {price}, button". Upload progress is announced at 25, 50, 75 and 100%.

## 7. Phase 1 scope (over the air, today's build)

1. Capture strip on Create, plus the chilli long-press, the `video` and `image` icons, and the camera sheet and denied states.
2. `lib/capture.ts` store, `/capture` chooser with fit rules, price chips and song sheet.
3. `/capture/effects`, using `components/edit-options.tsx` taken out of Create.
4. `from=capture` prefill in Hum (goes straight to review), Create story (photo + AI animation) and Music video (kind plus photo or clip).
5. XHR upload with progress, Cancel, Try again, Save clip to Photos, and limit checks before upload.

No server change: `GET /api/billing` already returns `freeLeft`.

Effort: about 6–8 developer days plus 1 day of QA on an iPhone SE and an iPhone 13 or Pro Max.

**Don't touch `app.json` in Phase 1.** The runtime version uses the fingerprint policy, so any plugin or permission-string change breaks over-the-air delivery to installed phones.

## 8. Later phases

| Phase | What | Needs | Rough effort |
|---|---|---|---|
| **1b**, with the next App Store build anyway | Update `cameraPermission` to "Reelkar uses the camera when you tap Film or Snap, to make a reel, song or music video from what you film." Today's string only covers "a clip of you to put a song under". Also declare Arabic (and the Indian languages) as app localizations and turn on RTL (`expo.locales` / `CFBundleLocalizations`, `extra.supportsRTL`): checked 2026-11-07, the installed build stays left-to-right even with the iPhone set to Arabic, across the whole app. | `app.json`, new build | 1 day |
| **2a** | Reelkar's own camera (`react-native-vision-camera`): 15 / 30 / 60 s timer chips, record in pieces, flip, flash, framing guide, teleprompter for talking reels | native module, new build | 2–3 weeks |
| **2b** | Uploads that finish in the background (`expo-file-system` background session); Home Screen quick action "Film a reel" (`expo-quick-actions`); Siri "Film a reel in Reelkar" (through the existing `with-app-intents` plugin) | native for quick action and intent; background upload may be JS only | 1–1.5 weeks |
| **2c** | **Photo to AI song video in one step**: a photo plus "what's it about" makes a song and a performance music video with that person as the star (chains Song Studio and music video, one price shown up front) | new server pipeline, small app screen | 1.5–2 weeks |
| **2d** | "Bring this photo to life" for photos without people (food, places): image to video, priced per 5 s | new server pipeline, fal model cost | 1 week |
| **2e** | Several clips into one Edit (join, then edit) | server concat plus a multi-select picker | 1 week |
| **3** | Live AR filters and effects on the camera preview (face tracking, beauty, masks) | vision-camera plus Skia frame processors, or a licensed SDK (DeepAR or Banuba, about $ thousands a year); has to stay at 30+ fps on 2–3 GB Android phones | 6+ weeks plus licence; decide using Phase 1 data |

## 9. Acceptance criteria

- [ ] Create shows Film · Snap · Gallery as its first block. Holding the chilli button for 500 ms opens Film. RTL mirrors the order.
- [ ] Film opens the front camera, stops at 60 s and lets iOS trim. Snap returns a JPEG. Gallery accepts a photo or a video. Cancelling from any of them returns to Create with nothing changed.
- [ ] `/capture` shows only the makers the fit table allows. Every row shows a real price, or "See price" if the fetch failed. The first fitting maker is the Hero.
- [ ] A 70 s or 120 MB gallery video shows the warn banner with Trim it, and never starts an upload.
- [ ] On iPhone 13, a 60 s back-camera clip from Film is 95 MB or less, or the size warning shows.
- [ ] Edit from capture uploads with a live MB progress bar. Cancel stops it. Turning on airplane mode mid-upload shows the offline message, and Try again succeeds without filming again.
- [ ] Server errors appear word for word. 402 shows Get credits.
- [ ] Story and music video from a captured photo can't start until "Yes, they agreed" is tapped. A story with a photo is never Standard.
- [ ] Camera denied shows Open Settings and Choose from gallery. Microphone denied warns before filming.
- [ ] Hindi and Arabic strings fit at 200% text size. VoiceOver reads tiles, preview, rows with prices, and upload progress. All targets are at least 44pt. Light and dark both pass 4.5:1 for text and 3:1 for icons.
- [ ] `app.json` is unchanged in Phase 1, and an EAS Update reaches installed phones.
- [ ] Checks pass: `npx tsc --noEmit && npx expo lint`.

## 10. Copy keys

`capture.strip.title` "Start with your camera" · `capture.tile.{film,snap,gallery}` Film · Snap · Gallery (hi: वीडियो · फ़ोटो · गैलरी; ar: فيديو · صورة · المعرض) · `capture.tile.{film,snap,gallery}.a11y` "Film a video" · "Take a photo" · "Choose from gallery" · `capture.title` "What should we make?" · `capture.meta` "{sec} s · {mb} MB" · `capture.photo` "Photo" · `capture.retake` "Retake" · `capture.another` "Choose another" · `capture.remove` "Remove" · `capture.discard.{title,keep,discard}` "Discard this clip?" · "Keep" · "Discard" · `capture.maker.{edit,hum,moves,storyStar,mvStar}.{title,sub,cta}` (titles: "Edit my video" · "Put a song under it" · "Copy my moves into a music video" · "Star in a story reel" · "Star in a music video") · `capture.price.free` "Free · {n} left this week" · `capture.price.freeWeek` "Free · {n} a week" · `capture.price.credits` "{n} credits" · `capture.price.unknown` "See price" · `capture.consentNote` · `capture.tooLong` "This video is {len}. Reels can be up to 60 seconds." · `capture.tooBig` "This video is {mb} MB. Videos can be up to 95 MB. Trim it, or film at 1080p." · `capture.trim` "Trim it" · `capture.songSheet.{title,new}` "Which song?" · "Make a new song" · `capture.cam.{title,body,cta,later}` · `capture.cam.denied` "Camera is off for Reelkar." · `capture.mic.denied` · `capture.openSettings` "Open Settings" · `capture.filmAnyway` "Film anyway" · `effects.title` "Add effects" · `upload.progress` "Uploading {done} of {total} MB" · `upload.stay` "Stay on this screen until it's uploaded." · `upload.cancel` "Cancel" · `upload.offline` · `upload.retry` "Try again" · `upload.saveClip` "Save clip to Photos" · `create.longPress.a11y` "Film now".

## 11. Open questions for the owner

1. **Permission wording before the 1b build.** Is it fine to ship Phase 1 with the current camera string ("a clip of you to put a song under")? It honestly covers selfie clips and photos of you, but not back-camera scenes. Pick: ship now and fix the wording in 1b *(my pick)*, or hold Phase 1 for a new build.
2. **Save raw captures to Photos automatically?** The default is off. People can save on failure, or from Retake. Turning it on means a permission prompt on the first capture.
3. **Home entry.** Add a small "Film something" row to Home's checklist for new users only, or keep capture on Create only *(my pick, measure first)*?
4. **Phase 2 order.** My pick: 2c (photo to song video in one step) first, because it's the owner's exact ask and needs no new build, then 2a (Reelkar's own camera).
