# Reelkar mobile app

The phone app (Android and iOS) for Reelkar, built with Expo SDK 58 and Expo Router. It talks to the Next.js backend in `../` (`story-film`). The design comes from `../design/v1.0` (Trust Navy); `src/theme/tokens.ts` is generated from its `tokens.json`.

## Run it

```bash
npm install
cp .env.example .env.local   # optional: set EXPO_PUBLIC_API_URL to your backend
npx expo start
```

Without `EXPO_PUBLIC_API_URL` the app runs in **demo mode**: sign-in is skipped and reels, ideas and captions are sample data. That is enough to click through every screen in Expo Go or a web browser (`npx expo start --web`).

With a backend:
1. Run the backend (`npm run dev` and `npm run worker` in `../`).
2. Set `EXPO_PUBLIC_API_URL` to an address your phone can reach (your computer's LAN IP, not `localhost`).
3. Sign in with an Indian mobile number (codes print in the backend log until MSG91 is set up) or Google.

## What's in the free beta

| Area | State |
|---|---|
| Sign-in: Google, Indian mobile OTP | Working (Better Auth, session in secure storage) |
| Onboarding: Quick start → first reel free | Working |
| Home: this week, checklist, recent reels | Working |
| Create: story or motion reel, 3 looks + 7 Indian art styles, idea or AI ideas, language, length, standard or premium | Working |
| Making progress, finished reel with video, AI captions, share | Working |
| Connect Instagram and YouTube (in-app browser), post now or schedule from a reel | Working |
| Calendar: upcoming and recent posts, cancel, retry, open | Working |
| My reels, Account (language, light/dark, sign out, delete account), Credits (prices only) | Working |
| Inbox, Earn | "Coming soon" screens; their backend is not built yet |
| Buying credits | Off during the free beta (in-app purchases need Apple/Google billing) |

## Scripts

| Command | What it does |
|---|---|
| `npm run theme` | Regenerates `src/theme/tokens.ts` from `../design/v1.0/tokens.json` |
| `npx tsc --noEmit` | Type check |
| `npx expo lint` | Lint |
| `npx expo export -p web` | Static web build (used for screenshots) |

## Builds and store

- App ids: `app.reelkar` (iOS bundle id and Android package). These can't change after the first store release.
- Builds use EAS (`eas.json`): `development` (dev client, demo mode), `preview` (internal APK / ad-hoc for testers), `production`.
- Beta testers: TestFlight on iOS and a Google Play internal or closed test track. Both need developer accounts (Apple $99/year, Google $25 once).
- Studio (publisher) name: not chosen yet. Support email, privacy link and API URL come from `EXPO_PUBLIC_*` env vars (set them per build in EAS). Developer accounts can move to the company later: Apple can convert an individual account to an organization, and Google can transfer apps to another developer account.
