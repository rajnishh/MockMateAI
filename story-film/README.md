# Story to Film (Phase 0)

Makes narrated 9:16 videos for Reels, Shorts and WhatsApp:

- **Short film:** a story → script + shot list → keyframes → clips → narration (+ music) → FFmpeg assembly with a burned-in "Created with AI" label.
- **Cartoon episode:** create a character once (reference image + fixed description + seed), then one idea per episode keeps the same character. Optional "made for kids" safety rules.
- **AI ideas:** topic suggestions for a niche or a character, tap to use.
- **Languages:** English, Hindi, Marathi, Bengali, Tamil, Telugu and Arabic for scripts, narration, captions, AI post copy, ideas and songs (plus Hinglish for songs), all in native script. Narration engine per language: Kokoro (English, Hindi), Sarvam Bulbul (Marathi, Bengali, Tamil, Telugu), Chatterbox Multilingual on fal.ai (Arabic). Languages whose engine isn't configured show as "coming soon" and are refused before any credits are charged. Captions use Noto fonts per script and render Arabic right-to-left.
- **Indian art styles:** besides cinematic, 3D cartoon and realistic looks, reels can be drawn as Madhubani, Warli, Gond, Pattachitra, Kalamkari, Indian miniature or classic Indian storybook art (one shared catalogue in `src/lib/styles.ts` feeds the prompts, database and both apps).
- **Motion reels:** animated text-and-graphics reels with a voice-over (hook title, lists, counting numbers, quotes, call-to-action button), drawn frame by frame with Skia and streamed into FFmpeg. No image or video models, so they cost no AI-animation credits; they use the free weekly allowance like any standard reel. Four colour themes, every language and script, a progress bar and the "Created with AI" label. A 19-second 720p reel renders in about 8 seconds on one CPU.
- **Hindi + captions:** narration can be forced to Hindi (Devanagari) or English, or follow the user's text. Short phrase captions are burned in, timed to each shot's narration. Captions are drawn with Skia + HarfBuzz (`@napi-rs/canvas`) because FFmpeg's libass and drawtext mis-shape Devanagari conjuncts such as क्ष.
- **Accounts:** sign in with Google or an Indian mobile number + SMS code. Characters and videos are stored per user in Postgres, with a "My videos" library.
- **Calendar + YouTube and Instagram publishing:** connect YouTube channels and Instagram Creator/Business accounts (OAuth, tokens encrypted at rest; works from the web and the mobile app), then publish now or schedule a finished video. YouTube uploads are resumable, always declare AI content (`containsSyntheticMedia`), and default kid-safe cartoons to "made for kids". Instagram posts go out as Reels: Instagram fetches the video from a signed link that expires after 2 hours, the worker waits for processing, then publishes; long-lived tokens are refreshed in their last 10 days. Failed posts can be retried; scheduled ones cancelled.
- **AI captions and hashtags:** one tap writes platform-specific copy for a finished video from its script: YouTube title, description, hashtags (with #Shorts) and search tags in the calendar; Instagram captions (3-5 hashtags) and WhatsApp messages on the video screen. Hindi videos get Hindi copy; children's content never asks kids to engage. Every caption ends with "Made with AI." Limited to 60 per user per day.
- **Song Studio:** pick a topic, genre preset (Bollywood romantic, Punjabi pop, kids rhyme, bhajan…), mood, language (Hindi, Hinglish, English) and length; AI writes lyrics with [Verse]/[Chorus] tags (editable), and ACE-Step 1.5 on fal.ai sings them. 4 credits a song, refunded if it fails. Songs can't name or imitate real artists: a name list plus an LLM check run on the topic, AI lyrics and the final title/lyrics, and the request is refused if the check can't run. Premium videos also get ACE-Step background music when no self-hosted ACE-Step server is set.
- **C2PA Content Credentials:** every finished video (MP4) and song (MP3/WAV) gets a signed C2PA manifest saying it was created with generative AI (IPTC `trainedAlgorithmicMedia`), using Adobe's open-source `@contentauth/c2pa-node`. The app shows a "Content Credentials" badge with a link to verify. Signing never fails a job: if it can't sign, the file is delivered without credentials and the badge is hidden.
- **Music videos:** turn any finished song into a vertical music video. Whisper (Workers AI) finds when each lyric line is sung, the song is cut into 4-7s scenes on line starts (intro and outro included), the LLM writes one scene per segment from the lyrics (optionally starring a saved character), and scenes are pan-and-zoom (2 credits flat) or AI-animated (8 credits per 5s). Synced lyric captions, the song as the soundtrack, the AI label and Content Credentials. The video lands in My videos, so it can be captioned and scheduled like any other.
- **Sing in my voice:** users record 10-60 s of their own voice, reading an on-screen consent statement with a one-time 4-digit code. Whisper must hear that code in the recording (digits or number words, English or Hindi), so a clip of someone else can't be used; the statement, code, transcript, time, IP and browser are stored as consent evidence. Any of their songs can then be re-sung in that voice (4 credits): Demucs separates the vocals, a voice converter re-sings them (Chatterbox on fal.ai, or a self-hosted Seed-VC service via `SEEDVC_URL` for better melody), and the vocals are remixed over the original backing. Voices are private to the account, limited to 3, and deleting one erases the recording.
- **Credits + payments (Razorpay):** credit packs and monthly plans, priced in ₹ (UPI, cards, netbanking) for India and $ (cards) for everyone else. Credits are an append-only ledger; payments are verified by signature and credited exactly once whether the checkout callback or the webhook arrives first; failed videos are refunded automatically.
- **Installable on Android** (web app manifest) with a Share button that hands the MP4 to Instagram / WhatsApp / YouTube via the phone's share sheet.

Two quality levels, chosen per video:

| | Standard | Premium (AI animation) |
|---|---|---|
| Script + ideas | OpenRouter if configured, else Llama 3.3 70B on Workers AI | same |
| Images | FLUX.1 schnell on Workers AI | Nano Banana 2 on fal.ai (reference-image consistency) |
| Motion | Pan-and-zoom over stills, rendered locally with FFmpeg | Wan 2.5 / Kling 2.6 image-to-video on fal.ai |
| Cost to you | ≈ $0 (Workers AI free tier ≈ 14 six-shot videos/day) | ≈ $0.58 per 5s shot |
| Price to user | Free weekly allowance, then 1 credit | 8 credits per 5s shot |

The plan and the decisions behind it are in [docs/PLAN.md](docs/PLAN.md).

## Layout

| Path | What |
|---|---|
| `src/app` | Next.js UI and API (`POST /api/films`, `GET /api/films/:id`, `GET /api/films/:id/video`) |
| `src/worker.ts` | BullMQ worker that runs the pipeline |
| `src/lib/pipeline` | Script prompt/schema, orchestrator, FFmpeg assembly |
| `src/lib/providers` | Cloudflare (LLM + image), pan-and-zoom video, fal.ai (image + video), OpenRouter, Kokoro (TTS), ACE-Step (music) |
| `src/lib/characters.ts`, `src/lib/suggestions.ts` | Saved characters and AI ideas |
| `src/lib/auth-config.ts`, `src/app/login` | Better Auth: Google + phone OTP (rate-limited), sessions |
| `src/lib/pipeline/captions.ts`, `assets/fonts` | Caption phrasing, timing and rendering; bundled Noto Sans, Devanagari, Bengali, Tamil, Telugu and Arabic fonts (SIL OFL, see `assets/fonts/OFL.txt`) |
| `src/lib/youtube.ts`, `src/lib/posts.ts`, `src/app/calendar` | YouTube OAuth + upload, scheduling/publishing, calendar UI |
| `src/lib/post-copy.ts` | AI titles, captions, hashtags and tags per platform |
| `src/lib/songs`, `src/app/songs`, `src/lib/providers/fal-music.ts` | Genre presets, lyrics writer, real-artist safety, ACE-Step on fal, Song Studio page |
| `src/lib/provenance.ts`, `scripts/dev-c2pa-cert.sh` | C2PA signing and reading; development certificate chain |
| `src/lib/music-video`, `src/lib/providers/whisper.ts` | Lyric timing, scene planning and the music-video pipeline |
| `src/lib/voice`, `src/lib/providers/voice.ts`, `src/app/songs/my-voice.tsx` | Consent code check, voice profiles, separation + conversion + remix, recorder UI |
| `src/lib/billing`, `src/app/billing` | Pricing catalog, credit ledger, Razorpay client, checkout + webhook handling, Credits page |
| `src/lib/languages.ts`, `src/lib/providers/tts.ts` | Language catalogue (codes, scripts, engines) and per-language narration routing |
| `src/lib/db`, `drizzle/` | Drizzle schema (auth tables, characters, films) and SQL migrations |
| `src/lib/quota` | Free plan (1 film/week, ≤60s, 720p, watermark) and cost estimates |
| `src/lib/models/licenses.ts` | Allowlist that blocks non-commercial models (XTTS v2, F5-TTS, MusicGen…) |

## Run locally

Requires Node 22, Postgres, Redis, FFmpeg and Kokoro. Free mode needs a free Cloudflare account: create an API token with the "Workers AI" permission.

```bash
cp .env.example .env          # add CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN
docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=storyfilm postgres:17
docker run -d -p 6379:6379 redis:7
docker run -d -p 8880:8880 ghcr.io/remsky/kokoro-fastapi-cpu:latest
# Optional music: an ACE-Step server exposing POST /generate {prompt, duration, instrumental} -> audio/wav
npm install
npm run db:migrate
npm run worker                # terminal 1
npm run dev                   # terminal 2, then open http://localhost:3000
```

## Checks

```bash
npm run typecheck
npm test                      # includes an end-to-end run with fake providers and real FFmpeg,
                              # and database + OTP sign-in tests on in-process Postgres (PGlite)
```

## Not in Phase 0

GST invoices signing, a child-like voice, a choice of narrator voice, word-by-word highlighted captions, Facebook publishing, analytics, songs, and Indian languages beyond Hindi. These are Phase 1+ in the plan. Generated media lives on local disk under unguessable names until object storage arrives in Phase 1.

## YouTube publishing notes

- The publisher runs inside `npm run worker` and only starts when `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `TOKEN_ENCRYPTION_KEY` are set.
- Each post is a delayed BullMQ job (job id = post id); on start-up the worker re-queues any scheduled posts.
- Until the Google Cloud project passes YouTube's API audit, every upload is forced to **private** by YouTube; the app shows this on the post. Apply for the audit early (it can take weeks).
- A default project gets about 100 uploads a day, shared by all users.

## Payments notes

- Set the Razorpay keys and webhook secret, run `npm run billing:plans` once per Razorpay mode (test/live), and paste the printed plan ids into `.env`.
- Prices live in `src/lib/billing/catalog.ts` (placeholders, GST-inclusive for India). Credit costs per video are there too.
- USD needs **International Payments** enabled in the Razorpay dashboard (requires extra KYC). Foreign-sales tax (VAT/sales tax) is your responsibility with Razorpay; switch global sales to a Merchant of Record such as Paddle if that grows.
- Indian sales need GST invoices; not generated yet.

## Content Credentials notes

- Run `scripts/dev-c2pa-cert.sh` for a development certificate. Verifiers (e.g. contentcredentials.org/verify) will show it as an unrecognised signer; the AI disclosure and tamper check still work.
- For production, buy a document-signing certificate from a CA on the C2PA trust list, keep the key in a secret manager, and set `C2PA_TSA_URL`.
- Platforms often re-encode uploads and may strip the manifest. That's why videos also carry the burned-in label and YouTube's synthetic-media flag.

## Changing the schema

Edit `src/lib/db/app-schema.ts`, then `npm run db:generate` to write a new migration into `drizzle/`. If Better Auth plugins change, run `npm run auth:schema` first to refresh `src/lib/db/auth-schema.ts`.
