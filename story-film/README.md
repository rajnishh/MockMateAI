# Story to Film (Phase 0)

Makes narrated 9:16 videos for Reels, Shorts and WhatsApp:

- **Short film:** a story → script + shot list → keyframes → clips → narration (+ music) → FFmpeg assembly with a burned-in "Created with AI" label.
- **Cartoon episode:** create a character once (reference image + fixed description + seed), then one idea per episode keeps the same character. Optional "made for kids" safety rules.
- **AI ideas:** topic suggestions for a niche or a character, tap to use.
- **Hindi + captions:** narration can be forced to Hindi (Devanagari) or English, or follow the user's text. Short phrase captions are burned in, timed to each shot's narration. Captions are drawn with Skia + HarfBuzz (`@napi-rs/canvas`) because FFmpeg's libass and drawtext mis-shape Devanagari conjuncts such as क्ष.
- **Accounts:** sign in with Google or an Indian mobile number + SMS code. Characters and videos are stored per user in Postgres, with a "My videos" library.
- **Calendar + YouTube publishing:** connect one or more YouTube channels (OAuth, tokens encrypted at rest), then publish now or schedule a finished video on a month calendar. Uploads are resumable, always declare AI content (`containsSyntheticMedia`), and default kid-safe cartoons to "made for kids". Failed posts can be retried; scheduled ones cancelled.
- **AI captions and hashtags:** one tap writes platform-specific copy for a finished video from its script: YouTube title, description, hashtags (with #Shorts) and search tags in the calendar; Instagram captions (3-5 hashtags) and WhatsApp messages on the video screen. Hindi videos get Hindi copy; children's content never asks kids to engage. Every caption ends with "Made with AI." Limited to 60 per user per day.
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
| `src/lib/pipeline/captions.ts`, `assets/fonts` | Caption phrasing, timing and rendering; bundled Noto Sans + Noto Sans Devanagari (SIL OFL, see `assets/fonts/OFL.txt`) |
| `src/lib/youtube.ts`, `src/lib/posts.ts`, `src/app/calendar` | YouTube OAuth + upload, scheduling/publishing, calendar UI |
| `src/lib/post-copy.ts` | AI titles, captions, hashtags and tags per platform |
| `src/lib/billing`, `src/app/billing` | Pricing catalog, credit ledger, Razorpay client, checkout + webhook handling, Credits page |
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

GST invoices, C2PA signing, a child-like voice, a choice of narrator voice, word-by-word highlighted captions, Instagram/Facebook publishing, analytics, songs, and Indian languages beyond Hindi. These are Phase 1+ in the plan. Generated media lives on local disk under unguessable names until object storage arrives in Phase 1.

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

## Changing the schema

Edit `src/lib/db/app-schema.ts`, then `npm run db:generate` to write a new migration into `drizzle/`. If Better Auth plugins change, run `npm run auth:schema` first to refresh `src/lib/db/auth-schema.ts`.
