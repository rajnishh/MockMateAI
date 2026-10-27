# Story to Film (Phase 0)

Turns a short story into a narrated 9:16 film:
story → LLM script + shot list → Nano Banana 2 keyframes → Wan/Kling clips (fal.ai) → Kokoro narration + ACE-Step music → FFmpeg assembly with a burned-in "Created with AI" label.

The plan and the decisions behind it are in [docs/PLAN.md](docs/PLAN.md).

## Layout

| Path | What |
|---|---|
| `src/app` | Next.js UI and API (`POST /api/films`, `GET /api/films/:id`, `GET /api/films/:id/video`) |
| `src/worker.ts` | BullMQ worker that runs the pipeline |
| `src/lib/pipeline` | Script prompt/schema, orchestrator, FFmpeg assembly |
| `src/lib/providers` | fal.ai (image + video), OpenRouter (LLM), Kokoro (TTS), ACE-Step (music) |
| `src/lib/quota` | Free plan (1 film/week, ≤60s, 720p, watermark) and cost estimates |
| `src/lib/models/licenses.ts` | Allowlist that blocks non-commercial models (XTTS v2, F5-TTS, MusicGen…) |

## Run locally

Requires Node 22, Redis, FFmpeg, and the two self-hosted audio services.

```bash
cp .env.example .env          # add FAL_KEY and OPENROUTER_API_KEY
docker run -d -p 6379:6379 redis:7
docker run -d -p 8880:8880 ghcr.io/remsky/kokoro-fastapi-cpu:latest
# ACE-Step: run a server exposing POST /generate {prompt, duration, instrumental} -> audio/wav on :8001
npm install
npm run worker                # terminal 1
npm run dev                   # terminal 2, then open http://localhost:3000
```

## Checks

```bash
npm run typecheck
npm test                      # includes an end-to-end run with fake providers and real FFmpeg
```

## Not in Phase 0

Accounts and billing (an anonymous cookie identifies users for quotas), C2PA signing, Arabic narration (Kokoro has no Arabic voice), voice cloning, captions, and publishing. These are Phase 1+ in the plan.
