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
    - **Not yet:** moving or stretching moments in time, adding new moments, editing caption words.
