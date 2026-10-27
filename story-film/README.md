# Story to Film (Phase 0)

Makes narrated 9:16 videos for Reels, Shorts and WhatsApp:

- **Short film:** a story → script + shot list → keyframes → clips → narration (+ music) → FFmpeg assembly with a burned-in "Created with AI" label.
- **Cartoon episode:** create a character once (reference image + fixed description + seed), then one idea per episode keeps the same character. Optional "made for kids" safety rules.
- **AI ideas:** topic suggestions for a niche or a character, tap to use.
- **Hindi + captions:** narration can be forced to Hindi (Devanagari) or English, or follow the user's text. Short phrase captions are burned in, timed to each shot's narration. Captions are drawn with Skia + HarfBuzz (`@napi-rs/canvas`) because FFmpeg's libass and drawtext mis-shape Devanagari conjuncts such as क्ष.
- **Accounts:** sign in with Google or an Indian mobile number + SMS code. Characters and videos are stored per user in Postgres, with a "My videos" library.
- **Installable on Android** (web app manifest) with a Share button that hands the MP4 to Instagram / WhatsApp / YouTube via the phone's share sheet.

Two provider modes (`PROVIDER_MODE`):

| | free (default) | paid |
|---|---|---|
| Script + ideas | Llama 3.3 70B on Cloudflare Workers AI | OpenRouter (Gemini Flash by default) |
| Images | FLUX.1 schnell on Workers AI | Nano Banana 2 on fal.ai (reference-image consistency) |
| Motion | Pan-and-zoom over stills, rendered locally with FFmpeg | Wan 2.5 / Kling 2.6 image-to-video on fal.ai |
| Cost | ≈ $0 (Workers AI free tier ≈ 14 six-shot videos/day) | ≈ $3.50–7.50 per finished minute |

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

Billing and credits, C2PA signing, a child-like voice, a choice of narrator voice, word-by-word highlighted captions, direct publishing and the manager features, songs, and Indian languages beyond Hindi. These are Phase 1+ in the plan. Generated media lives on local disk under unguessable names until object storage arrives in Phase 1.

## Changing the schema

Edit `src/lib/db/app-schema.ts`, then `npm run db:generate` to write a new migration into `drizzle/`. If Better Auth plugins change, run `npm run auth:schema` first to refresh `src/lib/db/auth-schema.ts`.
