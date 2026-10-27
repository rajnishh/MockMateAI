# Building a Free "Story-to-Film" SaaS on Open Source: A Practical Build Plan (September 2026)

> Status: source plan for the `story-film/` scaffold. See [Decisions & verification notes](#decisions--verification-notes-2026-10-27) at the bottom for what changed after review.

## TL;DR

- **Fork EvoLinkAI/ai-short-drama (AIDrama Studio)**: the only candidate fork base that is both permissively licensed (SaaS-legal) and already ships the multi-tenant scaffolding needed (Next.js 15 + Prisma/MySQL + Redis/BullMQ + MinIO/S3 + Remotion + a multi-provider media gateway). Do **not** fork DramaClaw (Elastic License 2.0 forbids reselling as a hosted service), and treat waoowaoo's custom license as unusable until it has been read verbatim.
- **Launch API-first, not self-hosted.** A finished 1-minute vertical film (≈10–12 clips × 5s) costs roughly **$3.50–7.50 in API spend** using Wan 2.x/Kling on fal.ai for video, Nano Banana 2 for images, Kokoro/Chatterbox for voice, and ACE-Step for music. "Free to users" must mean a hard credit/quota + watermark model, not unlimited.
- **The hard part is publishing and compliance, not generation.** Instagram/TikTok require Business/Professional accounts + weeks-long Meta/TikTok app review; YouTube allows **up to 100 public uploads/day per project** but still requires a Google audit before an app can publish anything **public** on users' behalf. Use an aggregator (Blotato/Zernio/Ayrshare) for the MVP and disclose AI content (C2PA + on-screen label) on every video.

## Key Findings

1. Many open-source "idea/script → finished short drama" pipelines exist, but most are single-user local tools or source-available/custom-licensed. Only EvoLink and Anil-matcha are cleanly permissive.
2. Per-second video pricing has collapsed: Wan 2.x ~$0.05/s (480p) on fal.ai, Kling 2.6 Pro $0.07/s (audio off), Veo 3.1 Fast $0.10–0.15/s. API-first is viable; self-hosting only wins above ~40–60 clips/day.
3. Voice and music are solved with permissive licenses: Kokoro (Apache 2.0), Chatterbox (MIT), CosyVoice2 (Apache 2.0), ACE-Step (Apache 2.0). Avoid XTTS v2 (CPML), F5-TTS (CC-BY-NC), MusicGen weights (CC-BY-NC).
4. Publishing is the real blocker: IG Reels, TikTok Direct Post and public YouTube all require platform review and Business/Professional accounts.
5. AI-content disclosure is mandatory for realistic synthetic media on all three major platforms; production-assist (captions, scripts) is exempt.

## 1. Open-source end-to-end pipelines

| Repo | What it does | Stack | License | Verdict |
|---|---|---|---|---|
| **waooAI/waoowaoo** | Novel/script → storyboard, characters, voiceover → short drama | Next.js 15, MySQL/Prisma, Redis/BullMQ | Custom, unverified | License blocks confidence; single-dev beta |
| **dramaclaw/dramaclaw** | Script → storyboard → assets → film | FastAPI + React, SQLite | **Elastic License 2.0** (no hosted resale) | **Avoid as SaaS base**; self-hosted internal use only |
| **EvoLinkAI/ai-short-drama** | Novel/idea → script → storyboard → images → video → voiceover | Next.js 15, Prisma/MySQL, Redis/BullMQ, MinIO/S3, NextAuth, Remotion | Permissive (see notes) | **Best fork base** |
| **Anil-matcha/Open-AI-Micro-Drama-Generator** | Idea → screenwriter → storyboard → frames → video | FastAPI + Next.js 14, moviepy | MIT | Clean but MuAPI lock-in; reference only |
| **rolfie-han/YoLuster-shorts** | Short-drama workspace | Closed | Custom, source not released | Not forkable |
| **hyyyyyyz/dramai** | Browser-only pipeline | TypeScript | Verify | Too thin |
| **dav-niu474/huobao-drama-ai** | Script → short drama, 70+ LLMs | Next.js 16 | Verify | Watch |
| **Forget-C/Jellyfish** | AI short-drama workspace | Verify | Verify | Verify license |
| **neopen/story-shot-agent** | Screenplay → coherent video prompts (LangGraph) | Python | Verify | Useful prompt/consistency component |
| **SDSmirnov/AI-Story-To-Movie** | Story → MP4 with auto-casting | Python | Verify | Reference for consistency |

Borrow DramaClaw/waoowaoo **ideas** (character consistency, story graph), never their code.

## 2. Competitors and gap

LTX Studio (Free 800 one-time credits, non-commercial; Lite $15, Standard $35, Pro $125), Katalist (~$39), InVideo AI (~$25), Runway (~$12), plus clip generators (Pika, Kling, Veo, Sora 2).

**Wedge:** non-technical users uploading their *own* voice/story/stills, in *Arabic/Hindi/Indian languages*, with *one-tap publishing*, on a *genuinely free* (capped) tier.

## 3. Model / API layer

### fal.ai pricing snapshot (verify at launch)

| Model | Type | Approx price |
|---|---|---|
| Wan 2.5 / 2.x | video | $0.05/s 480p, $0.10/s 720p, $0.15/s 1080p |
| Kling 2.6 Pro | video | $0.07/s audio-off, $0.14/s with audio |
| Kling 3.0 | video | ~$0.10–0.20/s |
| Veo 3.1 Fast | video | $0.10–0.15/s (Lite ~$0.05/s) |
| Veo 3.1 Full | video | ~$0.40/s |
| Seedance 2.0 Pro | video | $0.13–0.68/s |
| Sora 2 | video | $0.30–0.75/s |
| Nano Banana 2 | image | $0.08 (1K), $0.06 (512px), $0.12 (2K), $0.16 (4K) |
| Nano Banana Pro | image | $0.15 (1K), $0.30 (4K) |
| Flux 2 [dev] | image | ~$0.025 |

### Self-hosted video

| Model | Min VRAM | License | Cost / finished second |
|---|---|---|---|
| Wan 2.1/2.2 14B | 65–80GB | Apache 2.0 | ~$0.08–0.10 (H100), ~$0.03 spot |
| HunyuanVideo | 60–80GB | Verify | ~$0.14–0.21 |
| LTX-2.x | 16–32GB | Open | ~$0.004–0.07 |
| CogVideoX-1.5-5B | 24–32GB | Open | ~$0.07–0.10/clip |

### Cost per finished minute (≈11 clips × 5s)

- Wan 720p @ $0.10/s: video $5.50 + 11 keyframes $0.88 + voice/music ≈ $0 self-hosted + LLM $0.05–0.20 → **≈ $6.50–7.50/min**.
- Kling no-audio @ $0.07/s → **≈ $5/min**. Wan 480p / Veo Lite @ $0.05/s → **≈ $3.50–4/min**.

"Free" therefore means: 1 short film/week, watermark, 720p cap; credits for more; premium models only on paid tiers.

## 4. Components (commercial-safe)

- **STT:** faster-whisper (MIT), WhisperX (word timestamps).
- **TTS:** Kokoro-82M (Apache 2.0, 54 voices / 8 languages incl. Hindi, no cloning); Chatterbox Multilingual (MIT, cloning, built-in watermark); CosyVoice2 (Apache 2.0); NAMAA Saudi TTS (MIT, Arabic); Qwen3-TTS (Apache 2.0).
- **Avoid:** XTTS v2, F5-TTS, Fish/OpenAudio, MusicGen weights, LeVo 2, Wav2Lip OSS.
- **Lip-sync:** MuseTalk 1.5 (MIT), LatentSync, SadTalker, LivePortrait.
- **Music:** ACE-Step (Apache 2.0), YuE (Apache 2.0), DiffRhythm 2, HeartMuLa.
- **Consistency:** Nano Banana reference-locking first; LoRA / IP-Adapter / PuLID later.
- **Assembly:** FFmpeg, Remotion, MoviePy; WhisperX timestamps → burned captions.
- **Queue:** BullMQ (Redis); ComfyUI API for self-hosted workflows later.

## 5. Social publishing

| Platform | Requirement | Friction |
|---|---|---|
| YouTube Data API v3 | OAuth + `youtube.upload` | 100 uploads/day (own bucket since Jun 1 2026); unaudited apps upload **private** only |
| Instagram Graph API | Business account + FB Page + Meta app | App Review 2–6 weeks; Reels 9:16, 5–90s, ≤100MB |
| Facebook | Page + Meta app | Same review |
| TikTok Content Posting | App audit | Unaudited apps limited |
| X / LinkedIn | Paid tiers / restricted | Limited |
| Aggregators | Ayrshare $149–599/mo, Blotato $29/mo, Zernio free ≤2 accounts | Already reviewed — fastest path |

MVP: download + share link + one-tap YouTube; aggregator next; start Meta/TikTok review early (6–8 weeks).

## 6. Legal / platform risks

- Mandatory AI disclosure on YouTube, Meta, TikTok → embed **C2PA** + on-screen "Created with AI" label + set platform AI toggle.
- Voice cloning: explicit consent, block third-party voices, keep consent logs.
- License landmines listed in §4; Stable Audio Open free only under $1M revenue.
- AI output copyright is thin; user inputs keep their obligations — cover in ToS.

## 7. Architecture & MVP

- **Models at launch:** LLM via OpenRouter; Nano Banana 2 keyframes; Wan 2.x / Kling 2.6 (no audio) on fal.ai; Kokoro narrator; ACE-Step music; FFmpeg/Remotion assembly at 9:16.
- **v1 flow:** story (typed/spoken) → script + shot list → 3 style previews → ~10–12 keyframes → 5s clips → narration + music + captions → 60s vertical film → preview → download / YouTube.
- **Cut from day one:** 5–15 min films, native IG/TikTok/FB/X/LinkedIn, talking heads, LoRA actors, GPU fleet, collaboration, standalone song studio.

### Roadmap

- **Phase 0 (weeks 1–4):** pipeline end-to-end on fal.ai + Nano Banana + Kokoro + ACE-Step; 30–60s vertical film; hard quota + watermark.
- **Phase 1 (weeks 5–10):** auth, credits, billing, YouTube OAuth upload, C2PA + AI disclosure, Arabic/Hindi narration + captions; start Meta/TikTok review.
- **Phase 2 (months 3–5):** Chatterbox cloning with consent, LoRA consistency, aggregator publishing, 3-minute films, self-host Wan 2.2 + ACE-Step.
- **Phase 3 (months 6+):** MuseTalk presenters, image + song studios, 5–15 min films, premium tiers.

### India-first additions, phased in

The roadmap above stands. The launch market is **Indian creators** and it is built by a solo developer, so these items are layered onto the existing phases rather than replacing anything.

| Phase | Addition | Why |
|---|---|---|
| **0** | **₹0 free-tier path:** pan-and-zoom ("Ken Burns") on stills via FFmpeg in place of AI video, free OpenRouter `:free` LLM models, a free image source, Kokoro voice. Selected by a provider-mode switch so the paid fal.ai path stays intact. | Price-sensitive users; free films cost ≈ $0, which makes the free tier sustainable |
| **0** | **Installable web app (PWA)** + one-tap share of the MP4 to the Android share sheet (Web Share API with files) | Android is ~95% of Indian phones; posting to Instagram / WhatsApp / YouTube without Meta or Google review |
| **1** | **Hindi end-to-end** (script, Kokoro Hindi voice, burned captions) ahead of Arabic | First market |
| **1** | **Razorpay (UPI) credits** for AI-animated films; free tier stays pan-and-zoom | UPI is the default payment rail |
| **1** | Freemium split: free = pan-and-zoom, paid = Wan/Kling clips; optional single AI "hero shot" per free film later | Keeps AI video spend tied to revenue |
| **2** | **More Indian languages** (Tamil, Telugu, Bengali, Marathi) via AI4Bharat Indic Parler-TTS (verify license) or Sarvam Bulbul API | Kokoro only covers Hindi |
| **2** | **Native Android app (Expo)** on the same API, once there are users | Play Store discovery, better recording/gallery access; brings Play billing rules |
| **2** | WhatsApp Status / Reels / Shorts presets (length, safe areas, captions) | Where Indian creators actually post |
| **3** | iOS app | Small share of the Indian market |

Notes for the India launch: TikTok is banned in India (since 2020), so the TikTok items above apply only when expanding to other markets. Meta app review is still worth starting in Phase 1, but the share-sheet path means launch does not depend on it.

### Product modules

The product is a creator suite rather than a single film tool. All modules share one pipeline (script → images → motion → voice/music → assembly) and one publishing layer.

| Module | What the user does | Built on | Phase |
|---|---|---|---|
| **Short Film** | Story → narrated 30–60s vertical film | Existing pipeline | 0 (done) |
| **Cartoon Series** (hero feature) | Create a character once, then one tap per episode: "Anvi learns colours" → 30–60s kids cartoon with the same character every time | **Character bible**: name, fixed visual description, reference sheet (Nano Banana), voice; every episode passes the reference images. Kid-safe script prompt + content filter. LoRA later for stronger consistency | 0–1 |
| **Short Clips** | One prompt → 5–15s single-shot clip, meme or loop | Pipeline with one shot, no narration | 1 |
| **Song Studio** | Lyrics (typed or AI-written) + genre → song; optionally a lyric or music video | ACE-Step (vocals + instrumental); lyric video = keyframes + karaoke captions; music video = AI clips | 1 (audio), 2 (video) |
| **Sing in my voice** | Record ~1 min of own voice (with consent) → song sung in that voice | Voice conversion on the ACE-Step vocal stem (RVC-style; verify license of models used). Consent recording stored | 2 |
| **Creator & Manager** | Calendar, scheduling, multiple accounts, analytics, AI ideas/captions/hashtags, agency workspaces | See below | 1–3 |

**Cartoon Series templates**

The reference channel (Anvi's Mini English, ~212K followers) shows the format to target: one consistent 3D-animated toddler character (same hair and outfit in every post), 10–20s Reels teaching 6–10 English words, with on-screen text and a voiceover saying each word. The manual workflow it replaces is image tool → character reference → Kling/Hailuo/Runway/Veo → ElevenLabs → CapCut.

| Template | Output | Pipeline |
|---|---|---|
| **Word list** | 6–10 words, ~2s each, word (and meaning) as big text, voice says each word | 1 keyframe per word with the character in a matching scene → short motion (pan-and-zoom free, AI clip paid) → per-word TTS → text overlay + music |
| **Vocabulary cards** | Word groups (e.g. Bull / Cow / Calf) with the character pointing or reacting | Same as word list, grouped layout |
| **Scene story** | Character in a themed scene (outfits, haircuts, cars) naming items | Short Film pipeline with 3–5 shots |
| **Story episode** | 30–60s narrated mini-story | Short Film pipeline |

Needs on top of the current pipeline: a saved character bible, a child-like TTS voice (Kokoro has child-sounding presets; verify), large animated text overlays, and a word-list input instead of a free-text story. Characters made from a real child's photo are allowed only with a parent/guardian consent attestation, and the photo is stored privately. Market the style as "3D cartoon", not by studio names.

**Creator & Manager breakdown**

| Feature | Phase |
|---|---|
| Download + share sheet (Instagram / WhatsApp / YouTube) | 0 |
| Content calendar + scheduled posts; direct publish to YouTube (own channel) | 1 |
| AI ideas, captions, hashtags, series planning ("next 7 episodes of Anvi") | 1 |
| Multiple social accounts per user; Instagram/Facebook direct publish (after Meta review; aggregator until then) | 2 |
| Analytics (views, followers, best posting times) from platform APIs | 2 |
| Agency workspaces: manage other creators, roles (owner / manager / creator), approval before publish | 3 |

**Rules that apply to all modules**

- **No famous-artist voice cloning.** Indian courts have granted personality-rights protection against AI voice/likeness use (e.g. Arijit Singh, 2024; Amitabh Bachchan; Anil Kapoor), and platforms remove such content. Offer genre styles ("Bollywood romantic", "Punjabi pop"), original AI singers, or the user's own voice with recorded consent. Block prompts naming real artists.
- **Kids content.** Cartoon Series output is likely "made for kids" on YouTube (COPPA: comments and personalised ads disabled, must be flagged). Scripts go through a kid-safety filter; no real children's likeness.
- **AI disclosure** (label + C2PA) on every output, as in §6.

### Thresholds that change the plan

>40–60 clips/day → self-host GPU. Free-tier spend per user > revenue per user → tighten quotas / add ads. Meta/TikTok approved → drop aggregator. EvoLink unmaintained → self-host DramaClaw internally (never resold) + own shell.

## Caveats

Prices move monthly; waoowaoo and several other licenses unverified; EvoLink is small; platform reviews are the biggest schedule risk; music-model training-data provenance is legally untested.

---

## Decisions & verification notes (2026-10-27)

1. **Control plane: Next.js only.** The Spring Boot control plane from §7 is dropped for the MVP. Auth, credits and quotas live in the same Next.js app as the pipeline.
2. **EvoLink license discrepancy.** At upstream commit `3991bbb` the `LICENSE` file is **Apache License 2.0**, while `package.json` says `"license": "MIT"`. Both allow a hosted commercial SaaS, but Apache 2.0 requires keeping copyright/NOTICE text and marking modified files. Treat it as Apache 2.0 when copying any code.
3. **EvoLink maintenance.** The last upstream commit is dated **2026-06-24** (about 4 months old). That raises the maintenance risk noted in the caveats. The scaffold therefore does **not** vendor EvoLink (about 1,500 files). It is a lean, standalone app with the same stack shape (Next.js + BullMQ + provider adapters), so EvoLink pieces (Remotion editor, Prisma schema, auth) can be pulled in selectively later with attribution.
4. **fal.ai model IDs** in `src/lib/providers/fal.ts` were checked against fal's OpenAPI schemas: `fal-ai/nano-banana-2` (+ `/edit`), `fal-ai/wan-25-preview/image-to-video`, `fal-ai/kling-video/v2.6/pro/image-to-video`. Two defaults would silently raise cost if not overridden: Kling's `generate_audio` defaults to **true** (2× price) and Wan's `resolution` defaults to **1080p**. The adapters set both explicitly. They have not yet been exercised with a live `FAL_KEY`.
5. **Launch market: Indian creators, solo build.** The original plan is kept; India-specific work is phased in (see "India-first additions" under §7). The client is a web app made installable (PWA) first; a native Android app comes in Phase 2.
