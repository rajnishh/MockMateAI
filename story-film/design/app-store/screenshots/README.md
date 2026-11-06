# App Store screenshots

iPhone screenshots of the Reelkar app, for App Store Connect.

- `6.9/`: 6.9" display, 1320 × 2868 (iPhone 16 Pro Max).
- `6.5/`: 6.5" display, 1284 × 2778.

| File | What it shows | Suggested caption |
|---|---|---|
| `01-home.png` | Home ("Namaste, Priya"): weekly goal 3 of 5, three finished reels (one in Hindi), My songs | Your week of reels, in one place |
| `02-create.png` | Make a reel: Madhubani art style picked, a story typed, Make my reel | Type your story. Get a reel. |
| `03-song-studio.png` | Song Studio: "Monsoon wali chai" (Lo-fi Hindi) playing, with Publish, gift and music-video options | Your song, sung in minutes |
| `04-listen.png` | Listen: new songs from other creators, filters for Hindi, Arabic and Punjabi, mini player | Hear songs from creators like you |
| `05-reel.png` | A finished Hindi reel ("मसाला चाय का राज") with Save to Photos, Share and Post it | Your story, a reel in minutes |
| `06-hum-it.png` | Hum it: hum, sing or say an idea; film yourself or import a file | Hum it. We make the song. |
| `07-recipes.png` | Recipes: a Diwali banner and trending reel recipes you can remake for free | Remake a trending reel in one tap |
| `08-sign-in.png` | Sign in: Continue with Apple, or a code by mobile number (India, UAE) or email | Start free in seconds |
| `09-song-studio-dark.png` | Song Studio in dark mode: "Desert Nights" (Khaleeji) | Looks great, day or night |

## How they were made

- **App:** a Release build of `mobile/` from branch `claude/app-store-ready`, on the iPhone 16 Pro Max simulator. It was built with `EXPO_PUBLIC_API_URL=http://localhost:3100` and `npx expo run:ios --configuration Release`. OTA updates were turned off in the generated `ios/` folder, so the build could not load the production bundle.
- **Server:** a local Next.js server on port 3100, with its own worker. It used a separate Postgres database, `reelkar_appstore`, and Redis db 5. The owner's live app and its data were not touched.
- **Account:** the App Review demo login (`REVIEW_EMAIL` / `REVIEW_OTP`), with the profile set to Priya Sharma (@priyamakes).
- **Other creators:** a second test account, Arjun Mehta (@arjunbeats), has the five published sample songs (`npm run samples`).
- **Reels:** three free Standard reels.
- **Songs:** two made with ACE-Step on this Mac.
- **Recipes:** the three reels were shared as recipes.
- **Capture:**
  - Status bar set with `xcrun simctl status_bar … override --time 9:41 --batteryState charged --batteryLevel 100 --cellularBars 4 --wifiBars 3`.
  - Full-resolution PNGs taken with `xcrun simctl io <udid> screenshot`.
- **6.5" copies:** `sips --resampleWidth 1284`, which gives 1284 × 2789, then `sips --cropToHeightWidth 2778 1284`, which crops the height centred.

The `reelkar_appstore` database is still on the local Postgres (localhost:5432), so these screens can be captured again. Delete it with `dropdb reelkar_appstore` when it's no longer needed.
