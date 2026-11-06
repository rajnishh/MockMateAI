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
| **Cartoon Series** (hero feature) | Create a character once, then one tap per episode (e.g. "learns colours") → 30–60s kids cartoon with the same character every time | **Character bible**: name, fixed visual description, reference sheet (Nano Banana), voice; every episode passes the reference images. Kid-safe script prompt + content filter. LoRA later for stronger consistency | 0–1 |
| **Short Clips** | One prompt → 5–15s single-shot clip, meme or loop | Pipeline with one shot, no narration | 1 |
| **Song Studio** | Lyrics (typed or AI-written) + genre → song; optionally a lyric or music video | ACE-Step (vocals + instrumental); lyric video = keyframes + karaoke captions; music video = AI clips | 1 (audio), 2 (video) |
| **Sing in my voice** | Record ~1 min of own voice (with consent) → song sung in that voice | Voice conversion on the ACE-Step vocal stem (RVC-style; verify license of models used). Consent recording stored | 2 |
| **Creator & Manager** | Calendar, scheduling, multiple accounts, analytics, AI ideas/captions/hashtags, agency workspaces | See below | 1–3 |

**AI suggestions (all modules)**

Users shouldn't start from a blank page. At each step the app offers AI suggestions the user can tap or ignore:

- **What to make:** format ideas based on the user's niche and past posts (e.g. reel, short clip, cartoon episode, song, word-list or explainer reel).
- **Content:** topic ideas, script or lyric drafts, character ideas, shot lists.
- **Look and sound:** 2–3 style previews, voice and music options.
- **Posting:** caption, hashtags, best time to post, which account and platform.

Suggestions come from the LLM and are always editable; nothing is published without the user confirming.

**Creator & Manager breakdown**

| Feature | Phase |
|---|---|
| Download + share sheet (Instagram / WhatsApp / YouTube) | 0 |
| Content calendar + scheduled posts; direct publish to YouTube (own channel) | 1 |
| AI ideas, captions, hashtags, series planning (e.g. "next 7 episodes") | 1 |
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
6. **₹0 free mode uses Cloudflare Workers AI** (Llama 3.3 70B for scripts and ideas, FLUX.1 schnell for images) plus local pan-and-zoom video. The free daily allowance (10,000 neurons) covers roughly 14 six-shot videos a day; above that it costs about $0.008 per video. Anonymous Pollinations was tested and rejected: it watermarks images and only serves a low-quality model without a key.
7. **Phase 1 started with accounts + database.** Sign-in is Google plus Indian mobile OTP (Better Auth), data is in Postgres via Drizzle, and the anonymous cookie is gone. OTP sends are rate-limited per IP (3 per 10 minutes) because SMS costs money and attracts SMS-pumping abuse; the limiter is in-memory per server for now and should move to Redis when running more than one instance. Real SMS in India needs a DLT-registered sender and template (via MSG91); until then codes are printed in the server log.
8. **Hindi narration and captions.** Users pick narration language (Hindi in Devanagari, English, or same as their text); image/motion/music prompts stay in English. Kokoro's Hindi voice reads the narration. Captions are short phrases timed proportionally within each 5s shot (TTS returns no word timings; drift within a shot is small). FFmpeg's libass and drawtext were tested and both mis-shape Devanagari (क्ष split, matras misplaced), so captions are rendered with Skia + HarfBuzz (`@napi-rs/canvas`) and overlaid as images. Fonts: Noto Sans and Noto Sans Devanagari (SIL OFL), bundled.
9. **Calendar + YouTube publishing.** Users connect YouTube channels separately from sign-in (so phone-login users can publish too); OAuth tokens are AES-256-GCM encrypted at rest. Posts are scheduled on a month calendar and published by a delayed BullMQ job; a post is claimed before upload so a duplicate job can't upload twice. Every upload sets `containsSyntheticMedia` (YouTube's AI disclosure) and `selfDeclaredMadeForKids` (defaulted from the cartoon's "made for kids" setting). We schedule ourselves rather than using YouTube's `publishAt`, so the same calendar will drive Instagram/Facebook later. Open item: apply for the YouTube API audit; until it passes, uploads are forced private.
10. **Credits and payments: Razorpay for everyone.** India pays in ₹ (UPI, cards, netbanking); other countries pay in $ by card through Razorpay International Payments, so there is one integration. Trade-off: we handle foreign VAT/sales tax ourselves; move global sales to a Merchant of Record (Paddle/Lemon Squeezy) if they grow. Users buy one-time credit packs or monthly plans (Razorpay Subscriptions; UPI AutoPay in India). Credits are an append-only ledger with a unique (reason, ref) key, so a payment is credited exactly once whether the checkout callback or the webhook arrives first, and redelivered webhooks are harmless. Videos now pick a quality per video: Standard (pan-and-zoom; free weekly allowance, then 1 credit) or Premium AI animation (8 credits per 5s shot); credits are refunded automatically if a video fails. Prices and credit costs are placeholders in `src/lib/billing/catalog.ts`. Open items: GST invoices, and enabling International Payments on the Razorpay account.
11. **AI captions and hashtags.** Written per platform from the video's saved script: YouTube (title, description, #Shorts plus 3-6 hashtags, search tags) fills the schedule form; Instagram (hook, 3-5 hashtags) and WhatsApp (short message, no hashtags) appear on the finished-video screen with Copy, and Share also copies the caption because Instagram drops shared text. Hashtags are cleaned in code (one token, any script, deduped, capped). Every caption includes "Made with AI." Children's content addresses parents and never asks kids to comment or follow. 60 generations per user per day.
12. **Song Studio (audio).** Songs are made with ACE-Step 1.5 (MIT) hosted on fal.ai, so no GPU server is needed; a self-hosted ACE-Step can replace it later to cut cost. Users choose a genre preset (presets describe sound only), mood, language and length, and get AI lyrics with [Verse]/[Chorus] tags that they can edit. A song costs 4 credits (placeholder; check fal's price) and is refunded on failure. Real artists are blocked by a name list plus an LLM check on the topic, the AI's lyrics and the final title and lyrics; if the check can't run, the request is refused. Open items: test how well ACE-Step sings Hindi (it advertises 50+ languages without naming Hindi), legal sign-off on selling AI songs, and songs with video (Phase 2).
13. **C2PA Content Credentials.** Every finished video (MP4) and song (MP3/WAV) is signed with a C2PA manifest whose `c2pa.created` action has `digitalSourceType` = IPTC `trainedAlgorithmicMedia`, using Adobe's MIT-licensed `@contentauth/c2pa-node`. Tested: the signed video still plays, the AI marker reads back, and a single changed byte is detected as tampering. Signing never fails a job; the app shows a "Content Credentials" badge only when signing succeeded. Open items: buy a production signing certificate from a C2PA-trust-list CA (the dev certificate shows as an unrecognised signer), and set a timestamp authority. Platforms may strip manifests on re-encode, so the burned-in label and YouTube's flag stay.
14. **Phase 2 started: songs as music videos.** A finished song becomes a 9:16 music video. Lyric sync uses Whisper on Workers AI for word timings only (its text for sung Hindi is unreliable): lines are spread over the sung part in proportion to length, then snapped to the nearest pause; without Whisper they're spread evenly. The song is cut into scenes (4-7s standard, 3-5s premium) preferring cuts where a line starts; the LLM writes one English scene prompt per segment from the lyrics; scenes render as pan-and-zoom (2 credits flat) or AI clips (8 credits per 5s); captions show each lyric line while it's sung. Music videos are film rows linked to their song, so My videos, captions, scheduling, C2PA and refunds all work unchanged. Open item: check sync quality on real ACE-Step songs.
15. **Sing in my voice (with consent).** Users add a voice by recording 10-60 s while reading a consent statement that contains a one-time 4-digit code; Whisper must hear the code (digits or number words in English or Hindi), which stops uploads of other people's or celebrities' clips. Consent evidence (statement, code, transcript, time, IP, browser) is stored with the voice; voices are private, max 3 per account, and deleting one erases the recording. Re-singing a song (4 credits): Demucs (MIT, fal.ai) separates vocals from the backing; the vocals are converted with Chatterbox speech-to-speech (MIT, fal.ai), or with a self-hosted Seed-VC service if `SEEDVC_URL` is set; then they're remixed over the original stems. The result is a new song linked to the original and the voice, with Content Credentials. Open items: Chatterbox is built for speech, so test whether it keeps the melody on real songs; if not, run Seed-VC (GPL-3.0, so as a separate service only) on a GPU. Get legal review of the consent flow and ToS before launch.
16. **Build hygiene:** FFmpeg helpers moved to `src/lib/ffmpeg.ts` and font paths marked `turbopackIgnore`, which removes a Next build warning that would have bundled the whole project into the server output.
17. **More languages: Marathi, Bengali, Tamil, Telugu and Arabic** (English and Hindi were already supported). One catalogue (`src/lib/languages.ts`) drives scripts, narration, captions, post copy, ideas and songs, always in native script. Narration: Kokoro for English and Hindi; Sarvam Bulbul (paid API, about ₹1 per 10,000 characters) for Marathi, Bengali, Tamil and Telugu; Chatterbox Multilingual (MIT) on fal.ai for Arabic. A language whose engine isn't configured shows as "coming soon" and is refused before credits are charged. Captions use Noto fonts per script, checked visually for conjuncts, with Arabic right-to-left. The voice-consent code check accepts number words and native numerals in all these languages. This adds a small per-video cost for those languages even on the free tier. Open items: test how well the LLM writes and ACE-Step sings in Tamil, Telugu, Bengali, Marathi and Arabic; the consent statement itself is still shown in English; Arabic needs Gulf/MSA voice choices and RTL UI later.
18. **Scope grows to a creator studio, "zero to hero" (2026-10-28).** Two reference reels shaped this: an AI pipeline (research → script → edit → thumbnail → caption → voice → approve → schedule) that auto-posts to Instagram and YouTube and DMs a free guide to anyone who comments a keyword; and an AI that studies the creator's profile and niche, makes a week of branded reels and posts them daily, with an ebook lead magnet and a QR code to a community. MVP user: solo creators, both brand-new and existing creators moving from other tools. Agencies, many client accounts and the brand-deal marketplace come later. Platform order: Instagram + YouTube → Facebook → LinkedIn → TikTok → X. Modules, in build order:
    - **M1 Start (onboarding):** pick a niche, goals, languages and platforms; AI creates a brand kit (name or handle ideas, bio, logo, colours, fonts, intro and outro) and a 30-day starter plan. New creators get a guided first-week checklist.
    - **M2 Grow (research):** for connected accounts, read the creator's own posts and insights (Instagram Graph, YouTube Analytics) to find what performs; trend and topic ideas per niche and language. Third-party scraping of other profiles is not allowed.
    - **M3 Make (autopilot week):** batch-make a week of reels in the brand kit (hook, script, visuals, voice or "my voice", music, captions, thumbnail) using the existing pipeline; the creator only approves, records voice if wanted, or edits.
    - **M4 Post:** one calendar publishing everywhere, with a per-platform AI caption, best-time suggestions and approve-before-post. Instagram needs a Business/Creator account; TikTok posts stay private until our app passes TikTok's audit; X's posting API is paid; LinkedIn company pages need Community Management API approval.
    - **M5 Engage:** comment-keyword → auto DM (Instagram private replies; only inside Meta's messaging window and rate limits), AI reply suggestions, an inbox.
    - **M6 Earn:** lead magnets (AI ebook or guide to PDF, landing page with QR code, email capture), then selling ebooks and courses (lesson pages + video + Razorpay checkout), then a media kit and the brand-deal marketplace.
    - **M7 Learn:** short in-app lessons ("creator school") that teach each step, tied to the checklist.
    - **M8 Measure:** a weekly report on what worked, fed back into next week's plan.
19. **Brand: Reelkar; three apps, one design system (2026-10-28).** The product is named **Reelkar**. Checks so far: reelkar.in, .app and .ai are unregistered; reelkar.com belongs to an unrelated Turkish car site; no app is named Reelkar on the App Store (India, UAE) or Google Play; USPTO, EUIPO and WIPO show no identical or close mark. Still to do by hand: IP India and UAE trademark searches. The closest existing name is "Reelkart", a tiny Gurugram Shopify app. Design system v1.0 (https://claude.ai/artifact/UBYyBwMR62t7oBhgWNQsy5; copies in `design/v1.0/`) uses the **Trust Navy** direction, shared with the Bachat app: navy #18264A for brand and the main action, teal #2BC4B4 for growth and selection, and coral #F27A5E for wins. It is light by default with a full dark theme. Fonts are Manrope, falling back to Hind for Indian scripts and Noto Sans Arabic for Arabic. Tabs: Home, Create, Calendar, Inbox, Earn. Clickable wireframes of all 40 screens: https://claude.ai/artifact/A3YU4eFPh8WDdKdHLxRNfc (`design/v1.0/prototype.html`). Apps:
    - **Phone and tablet:** Expo (React Native).
    - **Web SaaS:** the existing Next.js app.
    - **Desktop (Windows, macOS, Linux):** a **Tauri 2** shell around the web app, so it shares the same screens. It adds system notifications, drag-and-drop of video files, local export, and a signed auto-updater. Tauri was picked over Electron because its installer is about 10 MB instead of about 150 MB and its permissions are locked down by default. Heavy rendering stays on the server; local FFmpeg can be added later as a Tauri sidecar.
20. **Pricing, currencies and payment methods (2026-10-28).** Prices include tax: GST in India and 5% VAT in the UAE. USD prices exclude tax. They live in `src/lib/billing/catalog.ts`.

    | | INR | AED | USD |
    |---|---|---|---|
    | Free | 3 standard reels a week, watermark, 720p, 20 welcome credits once, Instagram + YouTube, 1 free guide | | |
    | Creator, monthly: 120 credits, no watermark, all platforms, auto-DM, courses at a 5% fee | ₹499 | AED 29 | $7.99 |
    | Pro, monthly: 350 credits, 3 brand kits, my voice, songs, courses at a 0% fee | ₹1,299 | AED 75 | $19.99 |
    | Pack of 50 credits | ₹249 | AED 15 | $3.99 |
    | Pack of 150 credits | ₹649 | AED 37 | $9.99 |
    | Pack of 400 credits | ₹1,499 | AED 92 | $24.99 |

    **Credit costs.** A standard reel costs 1 credit after the free weekly allowance. A premium AI reel costs **12 credits per 5-second shot**, up from 8. A song costs 4 credits, a music video 2 credits (standard), "my voice" 4 credits and a free guide 3 credits. A premium shot costs us about ₹25 (Wan 480p plus a keyframe), so even a buyer who spends every credit on premium shots leaves a margin of about 30–40% after GST.

    **Currency.** It is picked from the visitor's time zone: India → INR, UAE → AED, everywhere else → USD. The user can switch it. The database enum gained `AED` (migration 0008).

    **Payment methods, by where people pay:**
    - **India, web and desktop:** Razorpay, covering UPI (Google Pay, PhonePe, Paytm), cards, netbanking and wallets. Monthly plans use UPI AutoPay.
    - **UAE and global, now:** Razorpay International Payments, covering cards and Apple Pay. It charges in AED or USD and settles in INR. Razorpay's Google Pay for international payments is listed as "launching soon".
    - **UAE and global, later:** once there is a UAE business entity, add **Stripe UAE**. Stripe officially lists Visa, Mastercard, Apple Pay, Google Pay and Link in the UAE, with a 2 AED minimum. Stripe does not list Samsung Pay there.
    - **Aani** (the UAE's instant-payment system, 12.5M+ users) is accepted online through Mastercard Gateway and Network International. Samsung Pay is offered by gateways such as Tap Payments. Confirm both with the chosen UAE acquirer before building.
    - **Inside the iOS and Android apps:** credits and plans are digital goods, so they must use Apple In-App Purchase and Google Play Billing. Apple Pay, Google Pay and UPI apply only to web and desktop checkout. A single entitlement service (for example RevenueCat) keeps credits in sync across stores and web. Store fees (15–30%) mean in-app prices may need their own price tiers. Decide this before the Expo build.
    - **Welcome gift:** every new account gets 20 credits once. This is idempotent per user, granted by a Better Auth `user.create` hook.
21. **Shorter onboarding (2026-10-28).** Sign-up is now Welcome → Sign in → Code → **Quick start** (topic, reel language, new or existing) → **Your first reel** (pick one of 3 ideas, free) → making → ready → Home. Brand kit, connecting platforms and the 30-day plan move to the Home checklist. Connecting platforms is also triggered by "Post now". The old Goals, Niche, Languages and 30-day-plan screens stay in the prototype, marked "Replaced", for reference.
22. **Mobile app for the free beta (2026-10-29).** `mobile/` is an Expo SDK 58 app (Expo Router, React Native 0.88) for Android and iOS. Its theme is generated from `design/v1.0/tokens.json`.
    - **App ids:** `app.reelkar` on both stores. These are permanent, so they are tied to the product, not the company.
    - **Publisher:** the studio name is still open (shortlist: Kikishu Labs, K2 Studio, Kimay Labs). Support email and privacy link are env settings until it's chosen. The beta can ship from personal Apple and Google developer accounts; both can be moved to the company later.
    - **Sign-in:** Google and Indian mobile OTP through Better Auth's Expo plugin. The backend trusts the `reelkar://` scheme (plus `exp://` in development) and now lets people delete their account, as both stores require. Their data is removed by `ON DELETE CASCADE`.
    - **Beta scope:**
      - Quick start, then a free first reel.
      - Home, Create (AI ideas, 7 languages, standard or premium), making progress, the finished reel with AI captions and share, My reels, Account, and Credits (prices only).
      - Calendar, Inbox and Earn show "coming soon" until their backends exist.
      - No purchases: in-app purchases need Apple and Google billing.
    - **Demo mode:** without `EXPO_PUBLIC_API_URL` the app uses sample data, so it can be tried without the backend.
23. **Posting to Instagram and YouTube from the app (2026-10-29).** Instagram uses the *Instagram API with Instagram Login*: a Creator or Business account, no Facebook Page. Scopes are `instagram_business_basic` and `instagram_business_content_publish`; long-lived tokens last 60 days and are refreshed in their last 10 days.
    - **Video delivery:** with Instagram Login, Meta only accepts a public `video_url`. Resumable upload is for Facebook Login apps only. So each post gets a signed link (`/api/public/video/<token>.mp4`) that expires after 2 hours and works only for that film. This needs a public https backend.
    - **Publishing:** the worker creates a Reels container, polls `status_code` every 30 seconds for up to ~5 minutes, then calls `media_publish`. Meta allows 100 API posts per account per 24 hours.
    - **Connecting accounts:** OAuth for both platforms now uses a signed, 10-minute `state` that names the user. This lets the mobile app start the flow with its session (`POST /api/connect/<platform>` returns the URL) and finish in the in-app browser. The callback sends the person back to `reelkar://connected`. The web keeps the same callback and returns to `/calendar`.
    - **Mobile app:** Connected accounts screen; "Post it" on each finished reel, with Now, Today 7:30 pm or Tomorrow (1 pm or 7:30 pm) for every connected account, each using its own AI caption; a real Calendar tab with cancel, retry and open.
    - **Open items:**
      - Meta App Review for Advanced Access, before people outside the app's testers can connect.
      - Google's YouTube API audit; until it passes, uploads stay private.
      - Best posting times from each account's own insights.
24. **Beta server (2026-10-29).** One Ubuntu machine with Docker Compose (`deploy/`): Caddy (automatic HTTPS), web, worker, a one-off migration job, Postgres 17, Redis 7 (with append-only persistence), and Kokoro TTS (CPU, pinned to v0.9.1). The web app and worker share an `output` volume. The same image runs web, worker and migrations. Official images are pulled through `mirror.gcr.io` to avoid Docker Hub limits.
    - **Health check:** `/api/health` (Postgres + Redis).
    - **Setup script:** installs Docker, a firewall (22/80/443), swap, automatic updates and nightly backups (database + videos, 7 days kept). It generates the secrets.
    - **Recommended machine:** 4 vCPU / 8 GB in Mumbai or Bangalore (DigitalOcean or AWS Lightsail), about $45–50 a month.
    - **Tested locally in Docker:** all services healthy, migrations applied, HTTPS through Caddy, phone OTP sign-in with welcome credits, worker reaching Kokoro.
    - **Not yet tested:** video rendering. It needs Cloudflare keys.
    - **Guide:** `docs/DEPLOY.md`.
25. **Indian art styles (2026-10-29).** Seven looks join cinematic, 3D cartoon and realistic: Madhubani, Warli, Gond, Pattachitra, Kalamkari, Indian miniature and classic Indian storybook (Panchatantra mood). One catalogue (`src/lib/styles.ts`) supplies the image-prompt hints, the `film_style` enum (migration 0010) and the pickers on web and mobile. These are traditional forms, several with GI tags, so we describe them as a look and never present a reel as an authentic artisan work. This was inspired by Madhubani and Panchatantra story reels getting about 4k likes and 5k comments.
26. **Motion reels on our own engine (2026-10-29).** Remotion (used in the viral "Claude + Remotion" reels) needs a paid company licence once the company has more than 3 people. So motion reels run on the Skia and FFmpeg stack we already use for captions.
    - **Script:** the LLM writes a typed script: title, list, stat, quote and cta slides; one of four themes; native-script text; no invented statistics.
    - **Voice and timing:** each slide's voice-over is made with the normal text-to-speech; slide length is the narration plus a beat, with extra time for list items.
    - **Rendering:** frames are drawn at 30 fps with simple easing (pop, slide, stagger, count-up ring, word-by-word quote, pulsing button) and streamed as raw RGBA into FFmpeg, which mixes the delayed narration and optional music.
    - **Pricing:** `film.format` = `story` | `motion` (migration 0011); motion reels are always standard quality, so they are free within the weekly allowance and cost 1 credit after it.
    - **Speed:** a 19-second 720p reel renders in about 8 seconds on one CPU.
    - **Next:** brand-kit colours and fonts as themes, more slide types (before/after, steps with icons, chart), and per-word highlight synced to the voice.
27. **Motion reels upgrade (2026-10-29).**
    - **Ending is the creator's choice:** none, follow, comment a keyword, or let the AI decide. It defaults to the AI deciding, and the AI is told never to force a call to action. "None" removes any ending the AI added anyway.
    - **New scenes:** contrast (strike-through, then the better idea), chart (a line that grows across real values), compare (before → after cards), timer (a countdown ring) and question (a speech bubble).
    - **On screen:** highlighted key words in the hook; voice-over captions on a dark pill, with the word being spoken in colour; output at 1080×1920.
    - **Brand look:** a brand colour, light or dark background, and a handle, set once in the app's Account screen. The colour is adjusted automatically until text and buttons pass contrast checks.
    - **Speed:** a 22-second 1080p reel renders in about 15 seconds on one CPU.
    - **Rule:** the reels the founder shared are market research. They tell us what to make easy; they are not templates to copy, so endings, keywords and looks are all choices.
28. **Edit my video, step 1 (2026-10-29).** This is for creators who film themselves, the group shown by the "Claude video effects" reels. `POST /api/edits` takes a multipart upload (≤60 s, ≤200 MB, MP4/MOV/WebM), probes it, charges like a standard reel and queues an `edit` job (`film.format = edit`, migration 0012). Caddy's upload limit was raised to 250 MB.
    - **Transcription:** Cloudflare `whisper-large-v3-turbo` with segment word timings and a language hint, at about $0.0005 per audio minute.
    - **Edit plan:** the AI plans zooms and cards from a timed transcript. Cards: point, list, a stat the creator actually says, optional cta that follows the ending choice. The plan is cleaned before use: times clamped to the video, overlaps dropped, at most 4 cards.
    - **Rendering:** FFmpeg decodes to 1080×1920 RGBA (crop to fill); Skia draws the zoom (aimed slightly above centre), the cards, word-timed captions on a dark pill, the handle and the free-plan label; FFmpeg encodes with the original audio. An 8-second clip renders in about 10 seconds.
    - **No Content Credentials:** the creator's own footage is not marked as AI-generated.
    - **Open items:**
      - ~~Face tracking and person cut-out~~ (done in step 2, decision 29).
      - Editing captions before rendering.
      - Landscape videos are cropped, not padded.
      - Uploaded originals stay on disk and need clean-up when an account is deleted.
      - Test Whisper's Hindi and Hinglish accuracy on real creator clips.
29. **Edit my video, step 2: effects around the creator, sounds and voice (2026-10-30).** Built from the "24 effects in one take" reel: one plain take, effects placed where the creator is in the frame.
    - **Vision:** `vision/analyze.py` runs MediaPipe's BlazeFace (short range) and Selfie Segmenter on CPU. Both models are Apache-2.0, about 0.5 MB, and kept in `vision/models`. It analyses the same 9:16 crop at 540×960 and writes `faces.json` (smoothed face box per frame) and `mask.mkv` (grayscale FFV1). A 6-second clip takes about 5 seconds. The worker spawns it; if Python or the models are missing, edits still render without effects. The image adds `python3`, a venv with `mediapipe==1.2.0`, and `libegl1`/`libgles2`, which MediaPipe loads even on CPU.
    - **Effects (AI-planned, 2–5 per video, 0.8–4 s each, never overlapping each other):**
      - `backdrop`: a big word behind the creator. Their mask is drawn over the word.
      - `spotlight`: the background dims, with a warm glow around the person.
      - `cutout`: the creator becomes a sticker with a white outline over the brand colour.
      - `stamp`: a slammed verdict beside the face.
      - `focus`: corner brackets lock on to the face, with a label.
      Backdrop and stamp never share the screen with a card. Effects the analysis can't support are dropped.
    - **Face-aware layout:** punch-in zooms centre on the face, and cards move above or below it.
    - **Sound effects:** pop, ding, boom, tick, shimmer, whoosh and stamp are synthesised with FFmpeg, so we own them outright (no licences, no attribution). They are placed automatically: a whoosh before a zoom, a pop or ding on a card, a boom on a backdrop, and so on. Never two within 0.25 s.
    - **Your voice:** three options.
      - As recorded: unchanged.
      - Clear: noise reduction, EQ, compression and loudness normalised to −14 LUFS.
      - Deeper: Clear plus a pitch drop of about 2 semitones with formants preserved (Rubber Band), and a low-end lift.
      It stays the creator's own voice and in sync with their lips. We don't offer voice conversion into someone else's voice.
    - **Open items:**
      - ~~Let creators toggle or swap single effects before rendering~~ (decision 30).
      - More effects: giant captions behind the person, countdown, checklist beside the head.
      - Check the Deeper voice on women's and children's voices; maybe offer two strengths.
      - Run the vision step in a separate worker if CPU becomes the bottleneck.
30. **Edit my video: review and fine-tune each effect (2026-10-30).** Creators can check the effects before rendering, after it, or both.
    - **Plan and render are separate steps:**
      - `planEdit` transcribes, analyses and plans, then saves `edit.json`: request, transcript, plan, what the analysis found, and the re-render count.
      - `renderPlannedEdit` mixes the soundtrack and draws the edit from that file.
      - A re-render never transcribes, analyses or calls the AI again, so it costs only CPU time.
    - **Review before rendering:** opt-in with "Let me check the effects first".
      - The `edit` job stops after planning with the new film status `review` (migration 0013).
      - The app opens the moments screen.
      - `PUT /api/edits/[id]` saves the changes and queues an `edit-render` job. Its job id is not the film id, so the job names the film.
      - The upload's charge travels with that first render, so it is refunded if the render fails.
    - **Fine-tune after:** the finished video shows "Fine-tune effects".
      - Up to 5 free re-renders per video; the count is kept in `edit.json`.
      - The old video stays until the new one is ready. If a re-render fails, the film goes back to completed with a note.
      - A conditional status update stops a double tap from starting two renders.
    - **The moments screen** (mobile `edit/[id]`, web `EditMoments`):
      - Every effect, card and zoom is listed in time order with the words said at that moment.
      - Each can be turned on or off.
      - Effects can be swapped to another type. Only types the analysis supports are offered: without an outline, there's no backdrop, spotlight or cut-out.
      - Text can be fixed: the backdrop word, stamp and label, and card text and list items. Switching to a text effect starts from the longest word said then.
      - Captions, sound effects and voice can be changed too.
      - The server sanitises the changes the same way it sanitises the AI's plan. The app warns when a backdrop or stamp would be hidden by a card at the same time.
    - **Timing, new moments and captions (same day):**
      - Each moment moves earlier or later and gets shorter or longer in 0.25 s steps.
      - New moments (any effect the analysis supports; key point, list or ending card; zoom) are added at the start of a chosen caption line. Number cards stay AI-only, because they must be a number the creator said.
      - Caption words are edited line by line: a new line after a 0.6 s pause or every 8 words. The same number of words keeps each word's timing; otherwise the line's time is shared evenly, and an empty line hides it. The server keeps words inside the video and in order.
      - One shared module (`src/lib/edit/moments.ts`, copied byte for byte into `mobile/src/lib/moments.ts`, checked by a test) holds the limits: effects 0.8–4 s, cards 1.5–8 s, zooms 0.5–3 s; at most 6 effects, 4 cards, 20 zooms; gaps of 0.5 s between effects and 1 s between zooms.
      - Clashes are shown in red on the moment and block rendering, where the server would otherwise drop the later moment silently. A test checks that a clash-free plan passes `sanitizePlan` unchanged.
    - **Drag timeline with a preview (same day):**
      - The moments screen opens with a preview and a timeline. There is one lane each for effects, cards and zooms, plus the caption lines for reference.
      - Drag a block to move it, or drag its edges to stretch it. Edges snap to word starts within 0.15 s, otherwise to 0.05 s. Blocks narrower than about 0.9 s only move; the buttons stretch them.
      - Tap the ruler or a lane to seek. Selecting a block seeks to its start and opens its editor, with Previous and Next.
      - Clashing blocks get a red border, off blocks are dashed, and the selected block is outlined. Each block has a screen-reader label with its times and any problem, and the buttons remain for anyone who can't drag.
      - The drag rules live in `dragSpan` and `snapTime` in the shared module.
      - **Preview:**
        - `planEdit` also writes `preview.mp4`: 540×960 in the final crop, H.264 CRF 30, a keyframe every 0.5 s, about 0.7 MB for 6 s. It is served from `GET /api/edits/[id]/preview`.
        - The draft includes the face box 10 times a second.
        - The overlay roughly sketches the active moment: zoom towards the face, spotlight dim, cut-out frame, the backdrop word, a stamp beside the face, focus brackets, the card, and 3-word captions with the spoken word highlighted. It is labelled as a rough preview, because the real render puts words behind the person.
        - Without a preview file (demo mode, or older edits) a timer drives the playhead.
      - Mobile uses `PanResponder` (core React Native, works on web too) and expo-video's `timeUpdate` event; the web app uses pointer events and a `<video>`.
    - **Range requests:** video, song and public-link routes now answer `Range` requests with 206 responses (`src/lib/serve-file.ts`). iOS needs this to play or seek an MP4 over HTTP, and the reel screen didn't have it before.
    - **Zoom and word timing (same day):**
      - **Zooming:** the timeline zooms from "whole video fits" up to 240 px per second.
        - Mobile: a two-finger pinch around the point between the fingers (a capturing `PanResponder`; a block being dragged hands over when a second finger lands), or −, Fit and +.
        - Web: Ctrl/⌘ + scroll, which is how trackpad pinches arrive (a non-passive listener, so the page doesn't zoom), or the same buttons.
        - The time under the fingers or pointer stays put (`scrollForZoom`). The ruler ticks adapt.
      - **Words:** past 90 px per second the captions lane shows single words. Tapping a caption line zooms straight in on it.
        - Drag a word to move it, or drag an edge to retime it (`dragWord`). Words stay between their neighbours, inside the video and at least 0.05 s long.
        - Selecting a word opens a word editor with 0.05 s Earlier/Later/Shorter/Longer and Previous/Next word.
      - **Caption words are now the source of truth.** Typing in a caption line is applied when the field loses focus (or at render), so the line doesn't regroup while you type. Retimed words are sent with the render like fixed text.
      - **Fixed:** the wide timeline widened the whole screen on web (a flex child's default `min-width: auto`). It now scrolls inside its own box.
      - On a very short clip, "Fit" is already past the word threshold, so the lane shows words straight away.

31. **Ask Reelkar, the built-in agent (2026-10-30).** Creators type (in any language) what to make and when to post; the agent does it and shows each step as a card. This is the first of three ways in: built-in agent (free, our models), then a Reelkar connector inside Claude, ChatGPT, Grok, Cursor and others (their subscription does the thinking), then bring-your-own API key. Subscriptions themselves can't be plugged into another app; the connector direction is the allowed one.
    - **Actions** (`src/lib/agent/actions.ts`, one zod schema each, written to double as connector tools):
      - `suggest_ideas`, `make_reel`, `make_week`, `post_reel`, `write_caption`, `list_reels`, `change_edit`, `set_posting_mode`.
      - Film creation and edit re-renders moved into shared services (`startFilm`, `rerenderEdit`), so the app and the agent follow the same quota, credit and validation rules.
    - **Planning:** one AI call per message returns a short reply plus up to 5 actions. Reels are referred to as R1… (newest existing) and N1… (made in this reply).
      - The context includes local time and time zone, language, topic, free reels left, posting mode, connected accounts and recent turns.
      - Unknown actions are ignored, and bad input becomes a readable error card. If the AI's answer can't be used, the agent replies with a friendly fallback.
    - **Posting mode** (per creator, migration 0014):
      - Ask me first (default): each post is a proposal card with Approve or Cancel.
      - Auto-schedule: the next 7:30 pm slot in the creator's time zone unless a time is given.
      - Auto-post: as soon as the reel is ready.
      - Approvals are claimed atomically (no double posts).
      - A post for a reel still being made waits; the worker sends it out when the reel finishes, with an AI caption per platform. A time that passed meanwhile becomes "now".
    - **Free plan:**
      - One weekly reel allowance whether reels are made in the app, by the agent or (later) from Claude/ChatGPT.
      - The agent answers 40 messages a day.
      - "Make my week" stops when free reels and credits run out.
    - **Apps:** mobile "Ask Reelkar" screen, opened from Home. It has a chat, starter prompts, a posting-mode switch, and cards with Make this, Approve/Cancel, Open/Progress, Copy caption, Connect and Get credits. The demo mode has a scripted agent. The web app has the same chat at `/ask` (linked from the studio header): starter prompts, posting-mode switch, the same cards, the device's time zone on every request, and the reel logo as its loader.
    - **API:**
      - `GET/POST /api/agent`: history, posting mode, free reels left; send a message.
      - `POST /api/agent/actions`: one action without the AI.
      - `POST /api/agent/actions/[id]`: approve or cancel.
      - `PUT /api/agent/settings`.


32. **Reelkar connector for AI assistants, step 1 (2026-10-31).** Creators can drive Reelkar from Claude Code, Claude Desktop or Cursor, using a subscription they already pay for.
    - **Endpoint:** `POST /api/mcp`, Model Context Protocol, stateless, plain JSON replies. It is hand-written rather than built on the SDK, and checked against the official MCP client.
    - **Tools:** the 8 Ask Reelkar actions plus `answer_proposal`. They are generated from the same zod schemas, so the app, the agent and the connector can't drift apart. Posting mode, free reels and credits apply as in the app, and connector activity appears in Ask Reelkar history.
    - **Sign-in:** personal keys from `/connect`: hashed, removable, last-used shown, at most 10 per creator, 300 calls an hour.
    - **Next:** OAuth 2.1 so ChatGPT and claude.ai web connectors can sign in, then directory listings after launch. Local setup is in `docs/CONNECTORS.md`.

33. **Build with Claude: the creator's own Claude writes, Reelkar makes the video (decided 2026-11-04).**
    - **Why:** creators already pay for Claude (or another assistant). Reelkar can't run on that subscription in the background (subscriptions cover the assistant's own apps; any other app needs paid API keys), but the creator can drive Reelkar from Claude through the connector. Claude then does the writing on their subscription, and Reelkar only makes the video with free parts: Cloudflare Workers AI pictures, the Kokoro voice, FFmpeg and code animation. No AI cost on Reelkar's side.
    - **The flow on a phone:**
      1. In the Reelkar app: idea (typed or suggested), length, then **Build with Claude**.
      2. Reelkar opens the Claude app with the full prompt filled in (idea, length, language, brand look, job id). The creator taps Send; apps can't send for each other.
      3. Claude writes the script and calls `make_reel_from_script`.
      4. When the reel is ready, Reelkar sends a notification, and Claude's reply has an "Open in Reelkar" link (`reelkar://reel/<id>`). Claude can't switch apps by itself.
      5. Preview, adjust, post or schedule in Reelkar.
    - **Grok Imagine, Gemini and similar apps** have no connector: Reelkar opens them with the prompt copied, the creator makes the clip there, then **Share → Reelkar**, and Edit my video finishes it (captions, brand look, sounds).
    - **Steps:**
      1. Done: connector tools `make_reel_from_script` (Claude's title, shots, narration, picture and motion prompts and music prompt; 3, 6 or 12 shots for 15, 30 or 60 seconds; connector-only, so Ask Reelkar's own planner doesn't use it) and `get_reel` (progress, then a 2-hour video link, the app link and the web link).
      2. A free code-animated format (for example a kids' dance: cartoon kids, a dhol beat, a chanted hook, lyric captions), so movement doesn't need paid video models.
      3. Reelkar reachable from the Claude app: a Cloudflare Tunnel from the creator's machine (keeps making videos free) or a hosted server, plus OAuth 2.1 sign-in for claude.ai custom connectors (paid Claude plans).
      4. In the app: Build with Claude / Build with Grok buttons, a "reel ready" notification and the `reelkar://reel/<id>` link back.
      5. Share to Reelkar (share extension) for clips made in other apps.
    - **To check before step 4:** whether a `claude.ai/new?q=…` link opens the Claude phone app with the prompt filled in.
    - **Free API options** (limits change often; check before relying on one): text from the Gemini API free tier, Groq, Mistral or OpenRouter ":free" models (Reelkar already supports OpenRouter); pictures from Cloudflare Workers AI. Singing, music and AI dance video have no ongoing free API, only trial credits.

34. **Ask Reelkar can run on Claude, behind a switch (2026-11-04).**
    - **Why:** the free planner answers each message with one JSON plan and never sees what its actions did (a reel started, no free reels left, no account connected). Claude calls the actions as tools, reads each result, and can chain steps or explain a problem in its reply.
    - **How:** `src/lib/agent/claude.ts` runs the Anthropic SDK's tool runner (not the Claude Agent SDK, which brings Claude Code's file and shell tools). Each tool is one Ask Reelkar action, with the same names, descriptions and input schemas as the connector (`tools()` in `mcp.ts`); connector-only tools and `answer_proposal` stay with the connector, since approvals are buttons in the app.
      - The fixed rules are a cached system prompt (`toolPlannerSystemPrompt`); the creator's situation goes with each message (`contextLines`). The free model's prompt is unchanged.
      - At most 5 actions per message, low effort, Claude Haiku 5.5 by default (on the model allowlist).
      - If Claude fails before doing anything, the free planner answers; if it fails partway, the creator sees what was done and nothing runs twice.
    - **Switch:** `ASK_REELKAR_AI=claude` plus `ANTHROPIC_API_KEY` (optional `ASK_REELKAR_CLAUDE_MODEL`). Default `free`, so decision 31 (the built-in agent is free) holds until this is switched on.
    - **Cost:** roughly $0.001 per message with Haiku (about 10k input and 800 output tokens over two calls); at most 40 messages a day per creator. Not yet tried against the real API.
    - **Next:** decide who gets Claude (everyone, paid creators only, or a daily Claude allowance), then run it against real chats in Hindi, Hinglish and English before switching it on.

35. **Sign-in for Gulf creators: UAE mobiles and email codes (2026-11-04).** Sign-in now takes Indian (+91) and UAE (+971) mobile numbers, a 6-digit code by email (Better Auth email OTP), or Google. Email works in every country with one sender (Resend, `EMAIL_PROVIDER=resend`); until it is set, codes print in the server log, like SMS. Only sign-in email codes exist: the plugin's password-reset, verify-email and change-email routes are closed, because codes nobody receives could only be guessed. Each number or address gets at most 5 codes an hour, whatever IP asks (stops inbox flooding and SMS pumping), on top of the per-IP limits. Real UAE SMS needs an international route (MSG91's, or Twilio Verify) and a registered sender.

36. **Cinematic quality: hyper-real 1080p reels, starring the creator's photo (2026-11-04).** A third quality above Standard and AI animation. Pictures come from Nano Banana 2, as for AI animation; each 5-second shot is animated by Kling 3.0 Pro (`CINEMATIC_VIDEO_MODEL=kling`, the default) or Veo 3.1 (`veo`), with their native audio off because narration and music are added in assembly. Output is 1080p with no watermark. Cost per shot, from fal's prices: Kling about $0.64 (~₹55), Veo about $1.28 (~₹113, since Veo makes a 6-second clip). Price: **26 credits per shot with Kling, 52 with Veo**, the same ~30% worst-case margin as AI animation. Free reels stay pan-and-zoom.
    - **Photo:** creators can add one photo (`POST /api/photos`; JPG, PNG or WebP up to 10 MB, checked by its bytes). AI animation and Cinematic story reels then make every picture with the photo as the first reference and a likeness instruction. Photos are kept in a folder per user, so a reel can only use its creator's own photos.
    - **Consent:** a reel with a photo starts only after the creator confirms the person is them, or agreed to be in it, and isn't famous. The time of that confirmation is stored on the film (`photo_consent_at`). Reels keep the "Created with AI" label and Content Credentials.
    - **Safety fix:** picture links in reel requests must now be https. Before, a `file://` link would have been read from the server's disk and sent to fal.
    - **Open items:** check fal's prices again before launch; run real Cinematic reels with a `FAL_KEY`; detect famous faces automatically, beyond the creator's word; delete photos when an account is deleted; consider lip-sync for song videos.
    - **Done 2026-11-05:** prices checked against fal's pricing API (Kling 3.0 Pro $0.14/s, Veo 3.1 $0.40/s), so Cinematic is now **30 credits per shot with Kling and 92 with Veo**; uploaded photos are deleted with the account; music videos take Cinematic quality and a star photo; and **"Sing it yourself"** music videos lip-sync the star to each scene's stretch of the song with Kling AI Avatar v2 (standard for AI animation, 16 credits per 5s; pro for Cinematic, 30). Famous-face detection is left out on purpose: this is a learning project for now.

37. **Ask Reelkar can also run on Gemini Flash, free (2026-11-05).**
    - **Why:** the same tool-calling Ask Reelkar as decision 34, but at no cost with a free Google AI Studio key, so decision 31 (the built-in agent is free) holds.
    - **How:** `src/lib/agent/gemini.ts` calls Gemini's REST API directly (no new package) and runs the tool loop itself: the same actions, rules, 5-action limit and history as on Claude (`plannerTools`, `limitedActions`, `chatHistory` in `claude.ts`). Actions run one at a time in Gemini's order.
    - **Limits:** the free tier has per-minute and per-day caps; when one is hit (429), the free Llama planner answers that message. Google may use free-tier prompts to improve its products, and EEA/UK/Swiss users need the paid tier.
    - **Switch:** `ASK_REELKAR_AI=gemini` plus `GEMINI_API_KEY` (optional `ASK_REELKAR_GEMINI_MODEL`, default `gemini-2.5-flash`, on the model allowlist). Not yet tried against the real API.

38. **Creators can pick Ask Reelkar's AI in the app, with their own key (2026-11-05).**
    - **Why:** creators can choose free or better models themselves, instead of the owner setting one for everyone in `.env`.
    - **Choices:** Reelkar free (the default, no key), Google Gemini, Groq, OpenRouter (hundreds of models, `:free` ones included), Anthropic Claude, and Ollama when the owner sets `OLLAMA_URL`. Each comes with a short model list; Groq, OpenRouter and Ollama also take any model id. The catalog is `src/lib/agent/ai-choice.ts`.
    - **How:** the choice lives on `agent_settings` (`ai_provider`, `ai_model`, `ai_key`, `ai_key_hint`). Keys are encrypted with `TOKEN_ENCRYPTION_KEY`, never sent back (only "…a1b2"), and own keys aren't offered without it. Saving checks the choice with one tiny message first, so a wrong key or model fails on the settings screen. OpenRouter, Groq and Ollama share one OpenAI-style tool planner (`openai-tools.ts`).
    - **Fallback:** if the creator's AI fails before doing anything, Reelkar free answers and the reply starts with why ("This Google Gemini key has hit its limit for now…").
    - **Limits:** 40 messages a day on Reelkar free (and Ollama, which runs on the owner's server); 300 with the creator's own key, only to stop runaway use.
    - **Safety:** the Ollama address comes only from the server's `.env`, never from creators, so the server can't be pointed at other addresses. Only chat changes; reels are still made the usual way.
    - **Where:** web Ask Reelkar page ("Who answers you"), mobile Ask Reelkar → "Who answers you" screen. Not yet tried against the real APIs.


39. **Pro remixes on ACE-Step 1.5 via Runware (2026-11-05).** fal hosts ACE-Step 1.5 only as text-to-music; its edit endpoints are the older v1 model. Runware (`runware:ace-step@v1.5-xl-base`, the base model, which supports every 1.5 task) was the only host with documented 1.5 cover and repaint over HTTP; WaveSpeed and RunComfy only have v1 edits, and no host exposes 1.5's lego/extract (add a track) yet. Runware's terms say you own outputs and allow commercial use; ACE-Step 1.5 is MIT.
    - **Key:** `RUNWARE_API_KEY` (with `FAL_KEY`). Without it, remixes run on fal's v1 as before and the new kinds aren't listed in `remixKinds` on GET `/api/songs`.
    - **With it:** Cover takes a `strength` (0 close to the original, 1 far; `coverStrength: true` on GET `/api/songs`), and Cover, Replace and Extend use 1.5 repaint (Extend repaints past the end, from just before the fade-out).
    - **Add vocals / Add instrumental (6 credits):** ACE-Step 1.5 covers the song close to the original with the new part named in the style, Demucs splits both the original and the cover, and only the new part (the cover's vocals, or its backing) is mixed with the original's own stems. About $0.2 for a 2-minute song.
    - **Untested live:** built from Runware's docs with fake-fetch tests. Check that audio uploads to Runware's media storage work, that higher Runware `strength` really stays closer to the input, and how well the cover's timing lines up with the original stems. If 1.5 lego becomes available on a host, switch the add kinds to it.
40. **"Hum it": hum, sing or just say it (2026-11-05).**
    - **What:** one big mic in the iPhone app (Create tab → Hum it, `mobile/src/app/(app)/hum/`). The creator hums a tune, sings a few lines, says what they want ("a Punjabi wedding song about my sister"), films a clip or imports a file. Reelkar works out which and shows "Here's what I heard" (kind, words, plan, price) before any credits are spent. Flow and copy: `design/voice-create-flow.md`.
    - **Hearing it:** `POST /api/voice/takes` saves the take under `OUTPUT_DIR/voice/<hashed user>/` (no table; takes older than a day are swept), takes the phone's own speech-to-text if it heard enough, else Whisper large-v3-turbo on Workers AI, then `src/lib/voice-create/heard.ts` decides: no real words (Whisper's "hmm", "thank you for watching") is a hum; request words or fast speech is a request; slow, held words are singing. The free LLM confirms it and fills the plan. The creator can correct it with three chips.
    - **A song on your tune:** hum and sing go to ACE-Step audio-to-audio on fal (`edit_mode: remix`, the original tagged "a cappella humming/singing"), which keeps the tune and timing and adds the band and a singer. $0.0002 per second of audio (fal pricing API, 2026-11-05), so **2 credits** (`TUNE_SONG_CREDITS`, priced like a cover). It runs as the existing `remix` song job, so the worker needs nothing new. A hum with a topic gets AI lyrics sized to the take; without, it stays instrumental. The song is as long as the take (up to 60 s); Song Studio's Extend makes it longer.
    - **Requests:** a spoken or typed request becomes a song (existing lyrics + song APIs; 30 s on Lyria, longer on ACE-Step), a reel (existing films API) or a music video (the song first, then the song's music video screen).
    - **Mix:** `POST /api/voice/mix` (free, ffmpeg): trim, fade in/out, voice and music levels, and "Replace my voice with the AI song" (voice at 0). An audio take comes back as a new song; a filmed clip as a new reel with the song under it.
    - **Device AI, optional:** on-device speech recognition (`expo-speech-recognition`) runs on the recording first; the server's Whisper is the fallback. An App Intent ("Hey Siri, make with Reelkar", also a Shortcuts action that takes text from any app, Gemini too) opens `reelkar://create?prompt=…`, which lands on the confirm screen and never makes anything on its own. `POST /api/voice/understand` plans a typed request. The App Intent is added by `mobile/plugins/with-app-intents.js` (Swift in `plugins/app-intents/`).
    - **Open items:** check hum-to-song quality by ear with real Hindi humming (fal accepted a synthetic hum and returned a 12 s song); a share-sheet extension (a separate iOS target) so text can be shared straight to Reelkar without Shortcuts; live preview of fades in Mix.
    - **Push notifications (2026-11-06, on the push system the Jugalbandi work added):** `src/lib/push.ts` sends through Expo's push service. New: the worker pushes when a song is ready or didn't work (every song job except a Jugalbandi's, which tells both singers itself) → `songs/[id]`, and when a reel is ready → `reel/[id]` or didn't work → `making/[id]`. The gift page pushes on the first open only (a play can come first; plays never push), as "Priya opened your gift" (G6). Each phone's language is saved with its token (`push_token.lang`, plus `platform`), and pushes are in English, Hindi or Arabic (`src/lib/push-copy.ts`). Account › Notifications turns Songs, Reels, and Gifts and Jugalbandis on or off (`push_prefs`, `GET/PUT /api/push-settings`; all on by default). Dead tokens are dropped from tickets and, 15 minutes later, from receipts. The token is deleted on sign-out. The app asks after a song or reel is made, with a one-time "Tell me when it's ready" card that leads to iOS's prompt (besides after sending a gift or starting a Jugalbandi), never on first launch.
      - **Owner, before pushes reach a real iPhone:** (1) Apple Developer → Certificates, Identifiers & Profiles → Keys → new key with "Apple Push Notifications service (APNs)"; download the .p8 once and keep it safe (never in the repo or a chat). (2) The EAS project already exists (`extra.eas.projectId` in `app.json`, owner rajnish.official); don't run `eas init` again. (3) In `mobile/`, `eas credentials` → iOS → production → Push Notifications: upload the .p8 with its Key ID and team 23MPNLMYKW (or let EAS make the key with your Apple sign-in). (4) Build with EAS; the `expo-notifications` plugin adds the push entitlement. (5) Optional: turn on "Enhanced security for push notifications" in the Expo project and set `EXPO_ACCESS_TOKEN` on the server.
      - **Not done yet:** G6's batching (more than 3 opens in an hour in one push); the app has no `gifts/[id]` thread yet, so gift pushes open the Inbox.

41. **Your AI engines: creators connect free AIs, and everything switches automatically (2026-11-05).**
    - **Why:** Reelkar's free Workers AI allowance (10,000 neurons a day) ran out during testing, and every song request then failed. Creators can now bring their own free AI accounts, and nothing depends on one engine.
    - **What:** a list of engines per creator (`ai_engine` table): Google Gemini, Groq, Cerebras, Mistral, their own Cloudflare Workers AI account (key plus account ID), OpenRouter, Anthropic Claude, and Ollama when the owner runs one. Keys are encrypted with `TOKEN_ENCRYPTION_KEY`; only "…a1b2" comes back. Each engine is checked with one tiny request before it's saved. Up to 8, in the creator's order, each can be switched off. Screens: web Ask Reelkar and mobile Ask Reelkar → "Your AI engines". It replaces the single "Who answers you" choice (item 38); migration `0022` copies any saved choice into the list.
    - **Auto-switch (`src/lib/ai/chain.ts`):** every AI task for a creator (lyrics, song safety checks, ideas, captions, voice understanding, reel and edit scripts, music-video shot lists, Ask Reelkar) tries their engines top to bottom, then Reelkar's lane. A daily allowance used up (429 mentioning a daily limit or quota, or 402) rests the engine until midnight UTC; a per-minute limit for 2 minutes; a key that stops working (401/403) for an hour. Rests live in Redis, shared by the web app and worker; if every engine is resting they're all tried anyway. Chat hands over to the next engine only if nothing was done yet.
    - **Reelkar's lane (owner's `.env`, never shown):** OpenRouter (if set), Workers AI, `GEMINI_API_KEY`, `GROQ_API_KEY`, with the same rests. `buildLlm(env)` is the lane alone; `llmForUser` (`src/lib/ai/engines.ts`) puts the creator's engines first.
    - **Local backup (2026-11-05):** with `OLLAMA_URL` set, Ollama on the owner's Mac is the lane's last engine ("Reelkar (this computer)", `OLLAMA_LLM_MODEL`, default `gemma3:12b`). It never runs out, so songs keep working when every free allowance is used up. On the M3 Pro it writes about 15 tokens a second: a 4-line Hinglish rap in about 3 s, a 60-second reel script in about 85 s, using about 8 GB while loaded. Run Ollama with `OLLAMA_KEEP_ALIVE=10m`, `OLLAMA_MAX_LOADED_MODELS=1` and `OLLAMA_NUM_PARALLEL=1`, so it frees its memory when idle and leaves room for ACE-Step. Creators who pick Ollama see `gemma3:12b` first.
    - **Credits:** unchanged. Credits pay for audio, pictures and video; the text AI was free before and still is.
    - **Not tried live yet:** Cerebras, Mistral and Claude's OpenAI-compatible endpoints were built from their docs with fake-fetch tests.

42. **How Reelkar makes money, and cheaper songs (decided 2026-11-05, not built yet).**
    - **Why:** Suno Pro sells about 500 songs for $10, roughly $0.02 a song. At 4 credits for a two-take song, Reelkar charges about $0.23. Songs are cheap to make, so a low song price brings creators in. The money comes from what they make next and from things that cost us nothing.
    - **Song prices (built 2026-11-06, in `src/lib/billing/catalog.ts`):** ACE-Step songs cost **1 credit per take**, so the usual 2 takes cost 2 credits instead of 4. A dance-reel song costs 1. A "Hum it" song, a cover and an extension each cost 1, down from 2. Lyria stays at 4 for 2 takes. Add vocals or music stays at 6. The Brand Studio signature jingle costs 1. The worst-case credit is about ₹3.1 after GST (Pro monthly, INR). Against fal's prices that leaves about 30% margin or more: an ACE-Step take is $0.0002 per second, about ₹2.1 for 2 minutes; Lyria is $0.04 per 30-second take. `SONG_CREDITS_PER_TAKE` and `songCredits(model, takes)` set the price, `src/app/api/songs/route.ts` charges per take, and `GET /api/songs` sends `creditsPerTake` so both song screens show the price for the chosen model and number of versions. A Jugalbandi follows automatically: 3 credits (a song plus a song on your tune), and a partner who offers half pays 1 (the starter pays any odd credit). `takeCredits` already splits the charge, so a failed take still refunds only its share. The screens read prices from the API.
    - **Free songs (later, optional):** 2 free ACE-Step songs a week, like the free weekly reels. That costs at most about ₹8 per active creator a week on fal. Start without it.
    - **Where the money comes from, in build order:**
      1. **Expensive, high-value next steps.** After every song, show "Make a video for this song". Music videos (34–40 credits per 5 s), AI and Cinematic reels, and lip-sync videos all carry 30%+ margin. One 2-minute Story music video is about 816 credits.
      2. **Charge for rights and convenience, which cost ₹0.** On Free, every reel, music video and song download carries the Reelkar watermark and is for personal use only. Paid plans get no watermark, commercial rights (needed for brand deals), a priority queue, the full Brand Studio, stems and 4K export. Spell out commercial rights in the terms.
      3. **Subscriptions over packs.** Monthly plan credits expire at the end of the month, or roll over up to one month's worth. Pack credits don't expire. Add **yearly plans** at about 2 months free.
      4. **Price by market.** Set AED and USD prices on their own merits rather than converting from INR. Gulf creators spend more.
      5. **Lower costs instead of raising prices.** Text AI stays free (item 41). Use Cloudflare FLUX before paying for Nano Banana. At a few thousand songs a day, rent one GPU for ACE-Step instead of paying fal per song. That is where Reelkar can match Suno's price.
      6. **Later: business plans and brand deals.** Team or agency plans (several handles) at 3–5 times the Pro price. Once creators have a Brand Studio media kit, match them with brands for a small cut of each deal.
    - **Not doing:** ads inside the app, or selling creator data.
    - **Open items:** check whether monthly credits expire today; decide the free-songs allowance; check the self-hosted GPU cost per song with a real load test before relying on it.

43. **Community: sharing and making together, outside-in (decided 2026-11-05, not built yet).**
    - **Why:** Suno has remixing of other people's songs (the owner can switch it off), Hooks (short videos set to songs), comments, playlists and remix contests with prizes. Analysts credit this social layer with keeping users coming back. Even so, Apptopia found about 45% of Suno's users from 30–60 days earlier hadn't opened it in the last 30, so a feed alone doesn't keep people. CapCut pays template makers by how often their templates are used and exported. Instagram Collab posts show two creators as co-authors; they were first tested in India and the UK. Reelkar creators want reach on Instagram and YouTube, not inside Reelkar, so community features grow that reach and bring new people in. A Suno-style public feed comes last.
    - **Today:** the only sharing is a signed link to a finished video that stops working after a couple of hours (`src/app/api/films/[id]/link/route.ts`). There are no public pages, profiles or remixes.
    - **Build order:**
      1. **Song gifts with "Reply with your own song".** A song made for someone (birthday, wedding, Eid, Diwali) goes out as a link, mostly on WhatsApp. The public page needs no sign-in: play, lyrics as they're sung, the sender's note. Its one button, "Reply with your own song", leads to a short sign-up and straight into Hum it or Simple song with the occasion filled in. This needs **lasting public pages** (a share token that doesn't expire and can be revoked) instead of today's short-lived links. The gift page is free.
      2. **Jugalbandi, a two-creator duet.** A starts it and records a part with Hum it, then invites B by link or @handle. B records on their own phone, and the AI joins both into one song with an optional music video. It posts as an Instagram Collab post on both accounts. A pays by default and B can offer to split; placeholder price is about a song plus a song on your tune.
      3. **Reel recipes that earn credits.** A finished reel can be shared as a recipe (style, script shape, effects, music). "Use this recipe" makes a new reel with the user's own photo and topic, and the recipe's maker earns a share of the credits spent, like CapCut. Seasonal festival recipes are the hook.
      4. **Remix chains with credit.** A song published as remixable can be covered, extended or rapped over. Each remix shows its family tree, and the original maker gets a share of the credits every remix spends. That's more generous than Suno, where a remix can't earn money unless it started from your own song.
      5. **Later:** Antakshari (each song starts with the previous song's last letter, with weekly themes); brand challenges paid by brands (ties into decision 42); crew spaces to share drafts for comments and approval (the home for team and agency plans); collab matchmaking by niche and size; and a public feed once there's enough shared content.
    - **Credit earnings:** the maker's share comes out of the credits spent, so Reelkar never pays out more than it takes in. Placeholder: 10% of the credits spent, paid as credits (not cash), and only on paid credits. Cash payouts would need KYC and tax handling first.
    - **Only what the law needs:** every public page has a Report link and a takedown process, with a grievance officer under India's IT Rules (the UAE has similar rules). The "Made with AI" label and Content Credentials stay. A song sung in someone's own cloned voice can be shared and played, but no one else can re-sing it in that voice: the consent in item 15 covers only its owner.
    - **Design:** Song gift and Jugalbandi flows are being designed in `design/community/` (`flow-spec.md`, `mockups.html`).
    - **Open items:** the share percentage; whether remixing is on or off by default; the share-token data model (a table, or a column on films and songs); and how the public gift page fits Caddy and caching.

44. **Listen, phase 1: public songs and a player that keeps going (owner approved all 8 recommendations below, 2026-11-06).** Design: `design/listen/flow-spec.md` and `design/listen/mockups.html` (Masala Pop v3.0). Borrows patterns from music apps the owner likes, never their name, look or text.
    - **Why:** the owner's favourite thing elsewhere is that the player never stops; it plays other creators' songs in many languages. Today Reelkar songs are private, with no feed, likes or queue.
    - **Publish:** songs are private by default. Song Studio's "Share on Listen" card → Publish (title, Show lyrics, Allow remixes, "Made with AI") → public; Make private undoes it. The first publish asks for a **handle** (`@name`), the account's first public name. Publishing re-runs the existing song safety checks; if they can't run, the song stays private. Public songs show title, @handle, genre, language, cover and lyrics.
    - **Listen** (iPhone tab, web `/listen` when signed in): hero with Play all, language chips, rails New, Trending this week (plays + likes in 7 days), Best of {genre}, and By language. Tapping a song plays it, and the rest of that rail becomes the queue.
    - **Autoplay radio:** the shared `SongPlayerProvider` moves from `AudioPlayer` to expo-audio's `AudioPlaylist`, because only the playlist answers the lock screen's next/previous (checked in expo-audio 58's iOS code). Background playback is already on in `app.json`. Queue sheet "Up next": Now playing, Next up, Remove (Undo), Clear, and "Keep the music going" (on by default, remembered per device). When one song is left, `GET /api/listen/related` picks 5: same genre, then language, then mood, with a little popularity and chance, skipping songs heard this session, songs marked Not for me and the listener's own; no creator twice in a row. Lock screen shows cover, title and @handle, with previous/next.
    - **Song page** (app `s/[id]`, web `/s/{publicId}` with no sign-in, built like the gift page `/g/{token}`): play, lyrics, plays, Like / Not for me, one reaction each from 🔥 💃 🥹 😂 🙏 🎉, More like this, By this creator, Remix (Song Studio's cover with this song as the source; credits shown first), Share (native share sheet with the public link) and Report on every public song, using the gift Report reasons.
    - **Counting:** one play per listener per song per day (`song_play`, like `gift_play`: user id when signed in, else the browser cookie); the maker's own plays don't count. Likes and Not for me in `song_vote` (+1/−1), reactions in `song_reaction`, with counter columns on `song` for sorting.
    - **Data (one migration):** `user.handle` (unique, lowercase); on `song`: `public_id` (10 characters, the gift token generator), `published_at`, `show_lyrics`, `allow_remix`, `taken_down_at`, `play_count`, `like_count`, `dislike_count`; tables `song_play`, `song_vote`, `song_reaction`, `song_report` (same reasons enum as `gift_report`). Public audio and cover routes by `public_id` need no cookie and return 410 once a song is private or taken down.
    - **No new content rules:** beyond the existing safety checks and the Report path, nothing new. Reports are stored for a person to review, as with gifts, and the owner takes a song down by hand (`taken_down_at`).
    - **Build order:** handle + publish + public page → playlist player, queue and Autoplay + lock screen → Listen rails → song page votes, reactions and rails → remix from someone else's song → web `/listen`.
    - **Phase 2:** comments, follows, For You, earn credits by listening and ranking, invite bonus, saved style prompts, a genre wheel, playlists.
    - **Owner decisions (2026-11-06), all as recommended:**
      1. Listen replaces Earn as the 5th tab (Earn is a placeholder; it moves to a Home card and Account until it ships). This changes item 19's tab list.
      2. Handles: a–z, 0–9, dot, underscore, 3–20 characters, unique, a short reserved list; change every 30 days.
      3. Not for me counts are never public; the creator sees their own total privately.
      4. Reaction counts show once a reaction has 3; plays and likes always show.
      5. Own-voice songs ("Sing in my voice") can be published by the voice's owner, labelled "Sung in their own voice".
      6. Remixes of others' songs are allowed unless the maker turns off Allow remixes; remixes credit and link the original.
      7. Reports never hide a song automatically; the owner reviews them, as with gifts.
      8. Add Punjabi (ਪੰਜਾਬੀ, `pa`) as a song language now, so By language has it (songs only; narration later).
    - **Built (2026-11-06):** migration `0024` (handles live in a new `creator_profile` table, not on Better Auth's `user`); `src/lib/listen.ts`, `src/lib/listen-queue.ts` (copied to the app; a test keeps them identical); routes under `/api/listen`, `/api/me/handle` and `/api/songs/:id/publish`; a public analysis route so public songs get timed lyrics; Remix accepts a public id when the maker allows it (and never for own-voice songs, whose voice is private to its owner); web `/s/{publicId}` (shares the gift page's Report dialog) and `/listen`; app Listen tab, Up next sheet, song page, publish + handle, report and remix screens. Earn moved to Account.
    - **Checked in the iOS simulator with two test users:** A picked a handle and published (the real-artist check ran on the free AI lane); the native share sheet showed the link preview; B saw the song with Gurmukhi lyrics, played it (one play counted after 10 s), liked it, reacted 🔥 and reported it (saved; the song stayed public). Rails, language chips, Next, Up next with Remove/Undo, Autoplay top-ups and auto-advance (also while the phone was locked) worked; the full player showed timed Arabic lyrics for a public song.
    - **Checked on a real iPhone 13 (2026-11-06, Release build):** the lock screen shows the song with its cover and `@handle` as the artist; Next there skips to the next song; Autoplay keeps going and plays are counted. Release builds can't reach a dev server by its LAN IP (iOS blocked it silently); point `EXPO_PUBLIC_API_URL` at the Mac's `.local` name instead, which the app's `NSAllowsLocalNetworking` allows.
    - **Not yet checked:** the signed-in web `/listen` page in a browser (sign-in rate limit during the test; it builds and its API is tested). Punjabi singing quality on ACE-Step is untested.

45. **Remix chains with credit, and one creator-earnings model (community item 4, built 2026-11-06).** Design: `design/community/remix-spec.md` and `remix-mockups.html`; its open questions taken as recommended (the maker of the song you remixed earns, 10% placeholder, no earnings from later spends on a remix, Allow remixes is per song, pro kinds open when the pro lane is on, web remix yes, amounts never public, private remixes reported without a name, paid share in proportion, one earnings model with recipes).
    - **Remixing others' songs:** Cover, Extend, Rap over it (1 credit each), plus New words and New beat (6) when Runware is on; never Replace part; never a song in anyone's own voice; the API answers 403 for those. Your own songs keep every kind and earn nothing.
    - **Family tree:** `remix_link` (one row per remix, own songs too; parent and root have no foreign key, so a deleted song in the middle becomes a "No longer available" node). Migration `0028` backfills existing remixes (songs with a parent that aren't "my voice" versions and remix someone else's song or carry a remix title suffix). Song page Remixes section (app and web) and a family tree screen (`s/[id]/family`, web `/s/{publicId}/family`, plain links, works without JavaScript). Counts are live queries (indexed), not a `remix_count` column, because take-downs are done by hand in the database and a counter would drift.
    - **Earnings (shared with reel recipes):** `src/lib/billing/earnings.ts`. One `creator_earning` table (`source` remix | recipe, hundredths of a credit), ledger reason `earning`. The share is `floor(charged × paidRatio × rate)`, where paidRatio = purchases and plan credits ÷ everything ever given (grants and earnings count as free; refunds left out), taken when the remix is charged. Pending until the remix finishes; dropped if it fails or the parent was taken down meanwhile; never clawed back. Whole credits go into the balance by the floor of the running total (`credit_balance.earned_hundredths` / `earned_credited`). Recipes call `startEarning` / `settleEarning` / `dropEarning` with source `recipe` and pass their own subject describer to `GET /api/me/earnings`.
    - **App:** Remix screen with the server's kinds and prices, header and credit cards and "How earning works"; Earnings screen (Account › Earnings and Credits; chips All · Remixes, Recipes added when they ship) and one song's detail; Inbox Remixes group; push kind `remixes` (at most one a day per song); locked credit line on the publish sheet and Share on Listen card; the maker's Allow remixes switch with "Stop new remixes?".
    - **Not done yet:** the "3 new remixes" push wording (the push goes out on the first remix of the day instead); offline caching of the tree and Earnings; a balance split to refund paid and free credits separately (refunds return the whole charge, as before). Not checked in the simulator or a browser yet.

46. **Reel recipes that earn credits (community item 3, built 2026-11-06).** Design: `design/community/recipes-spec.md` and `recipes-mockups.html`; its open questions taken as recommended (10% of paid credits, the lifetime paid share taken at charge time, free reels earn nothing but count as "free" uses, format, look, length, music, shape and effects locked while topic, photo, language and quality stay the user's, preview off by default when real people are in the reel, no recipes of recipe reels, music videos and Jugalbandis later, caption credit on by default, no web gallery, "रेसिपी", one earnings model with remixes).
    - **A recipe is a snapshot:** `src/lib/recipe-spec.ts` builds its `spec` (v 1, by format) from the reel's saved `script.json` / `edit.json` and the film row: story look, length, quality, script shape (roles, abstract intents and camera moves, written by the free text AI and checked: no digits, none of the reel's character or title words, then the real-artist check on share) and music prompt; motion theme, slide types and ending; dance scene, bpm, dancers' looks (no names), moves and voice; edit options and effect mix per minute (types only). Never the idea, narration, title, characters, photos, uploaded video, voice, brand kit or keyword. Files copied to `OUTPUT_DIR/recipes/<id>/` (480p 15 s preview only when the maker turns it on, poster, background track).
    - **Data:** migration `0029`: `recipe`, `recipe_use` (one per reel, unique film), `recipe_report`, `film.recipe_id`. Stopping sharing clears `published_at`; `taken_down_at` is set by hand after a report, which also drops pending earnings. The share sheet's draft is cached in the reel's work dir; after 2 unreadable shapes the reel can't be shared yet.
    - **Using one:** `POST /api/films` and `/api/edits` take `recipe` (404 unknown, 410 no longer shared, 400 when a locked value is changed or a ready-made script is sent); the job carries the shape, slide plan, dance plan or effect mix and the recipe's track, which the pipelines follow. `startFilm` charges as before, then records the use and `startEarning` (source `recipe`; nothing for your own use or a 0-credit reel). The worker calls `recipeReelFinished` (use count, `settleEarning`, push "Someone made a reel with X", at most one a day per recipe, under "Remixes and earnings") and `recipeReelFailed` (`dropEarning`) next to the refund.
    - **Festivals:** `src/lib/festivals.ts` (2026-27 dates, check each season): shown on Create from 21 days before to 2 days after; Arabic or a Gulf time zone puts Gulf festivals first. Featured picks are public ids in that file.
    - **Web and app:** `/r/{publicId}` (English, Hindi, Arabic RTL; link preview image; Report; stopped and removed states; Use this recipe goes through login to `/create?recipe=`, which locks the kind, look and length). App: Share as a recipe card and screen (handle first time, what people get, what stays private, name, Good for, preview switch), Recipes gallery, collections, recipe page (maker view with Stop sharing and Edit name), Create with a recipe (locked card, earnings line, gone banner), festival card and Start from a recipe rail on Create, Making and finished-reel "Recipe by @maker" with caption credit, Recipes chip and rows on Earnings, Delete reel and recipe / keep recipe.
    - **Changed from the spec:** the share sheet is a screen (`recipes/share/[id]`, like Listen's publish screen); intents are shown in English plus the maker's app language when the AI wrote it (no lazy translation per viewer language yet); the festival list isn't copied into the app (it comes from the API).
    - **Not done yet:** the daily digest push ("used 9 times"); the 60 s cache on `/api/recipes/home`; universal links from `/r/` into the app; the look card's "shot without people" poster (a recipe with people and no preview shows the style swatch); loop/trim with a fade when an edit's length differs (edit recipes have no track); Home's seasonal card; the owner's add/remove from a collection beyond `featured`. Not checked in the simulator or a browser yet.
