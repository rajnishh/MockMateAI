# Runway (runway.com / runwayml.com): research report for Reelkar

*Prepared 31 October 2026. Prices are as found in October 2026 sources. FX assumption: **1 USD ≈ ₹95** (late-October 2026 rate was roughly ₹95–97 per [poundsterlinglive](https://www.poundsterlinglive.com/history/USD-INR-2026) and [fxfeed](https://fxfeed.io/currencies/pairs/inr-usd?range=6m); INR figures are rounded).*

> **How this was researched, and its limits.** This session could not open runwayml.com, runway.com, docs.dev.runwayml.com or most third-party sites directly: the network blocked direct page fetches. Everything below comes from search-engine results, which index Runway's own pages (docs, changelog, help center, terms, research blog) plus press and third-party pricing trackers. A figure marked **(unverified)** came only from secondary sources, or the sources disagreed about it. **Check every price against [Runway's pricing page](https://runwayml.com/pricing) and the [API pricing page](https://docs.dev.runwayml.com/guides/pricing/) before you commit any money or set prices.**

> **About the name.** The user said "runway.com". That turns out to be right: Runway now publishes its research, changelog, terms and developer pricing on **runway.com** and **dev.runway.com** (for example [runway.com/research](https://runway.com/research/introducing-runway-gwm-1), [runway.com/changelog](https://runway.com/changelog), [dev.runway.com/pricing](https://dev.runway.com/pricing)). The older runwayml.com domains still appear in docs and help-center links. *The exact date of the domain move is unverified.*

---

## TL;DR

- **Runway is the "pro filmmaker" brand of AI video.** It raised a $315M Series E at a $5.3B valuation in February 2026, has about 140 staff, works with Lionsgate and AMC, and is now pitching itself as a **world-model** company (GWM-1).
- **Current flagship: Gen-4.5.** It costs **12 credits/s (about $0.12/s on the API, ₹11.4/s)**, makes 2–10 s clips at **720p**, and supports **9:16**. Native audio is **disputed or absent** on the API. **Gen-4 Turbo is the budget option** at 5 credits/s ($0.05/s). **Aleph 2.0** handles editing of existing footage at 28 credits/s.
- **Runway Dev has become a multi-model marketplace.** The API now also resells **Veo 3.1, Kling 4.0, Seedance, Ideogram, Seedream and ElevenLabs** TTS, sound effects and dubbing. It has a **Model Router** that picks a model by cost, latency or quality. That puts it in direct competition with fal.ai as an aggregator.
- **Cost of a 30-second, fully generated reel through the API:** about **$1.50 (₹143) with Gen-4 Turbo**, **$3.60 (₹342) with Gen-4.5**, and **$12 (₹1,140) with Veo 3.1 plus audio**. These figures exclude retries. That is close to Kling or Wan on fal for similar quality, and not cheaper.
- **Recommendation:** **Don't build Reelkar's premium tier on Runway.** Keep fal.ai Kling/Wan as the default premium path. Put the video provider behind an abstraction layer and add **Runway Gen-4 Turbo / Gen-4.5 as an optional "Cinematic" engine** for animating a few hero shots, after an A/B quality test. Consider **Aleph 2.0** later for a paid "restyle my clip" feature. Copy Runway's *agent + workflows + reference-consistency* ideas. Compete on Indic languages, posting and scheduling, price, and mobile-first UX.

---

## 1. What Runway is

### Company background

- **Founded:** 2018 in New York by Cristóbal Valenzuela (CEO), Alejandro Matamala and Anastasis Germanidis, who met at NYU's ITP programme ([Wikipedia](https://en.wikipedia.org/wiki/Runway_(company))). Runway co-developed the original **Stable Diffusion** release in 2022 with LMU Munich, and later released the Gen-1/Gen-2/Gen-3 video models.
- **Positioning:** Runway began as an "AI magic tools" video editor for creatives. It then became a frontier video-model lab. Since late 2025 it describes itself as building **"general world models"**, and the runway.com site title reads "Runway | Building Real-World Intelligence" ([domain listing](https://instantdomainsearch.com/de/domain-verzeichnis/runway.com)). TechCrunch reports that the latest raise is meant to "pre-train the next generation of world models and bring them to new products and industries" ([TechCrunch, Feb 2026](https://techcrunch.com/2026/02/10/ai-video-startup-runway-raises-315m-at-5-3b-valuation-eyes-more-capable-world-models/)).

### Funding

| Round | Date | Amount | Valuation | Lead / notable |
|---|---|---|---|---|
| Earlier rounds (seed to Series C extension) | 2018–2023 | about $545M cumulative per press ([AOL/Benzinga](https://www.aol.com/netflix-disney-quietly-545m-backed-020228403.html)) | about $1.5B (2023) | Google, Nvidia, Salesforce Ventures |
| Series D | Apr 2025 | about $308M **(unverified)** | about $3–3.3B (sources differ) | General Atlantic |
| **Series E** | **10 Feb 2026** | **$315M** | **$5.3B** | **General Atlantic**, with Nvidia, Fidelity, AllianceBernstein, Adobe Ventures, Mirae Asset, Felicis, Premji Invest, AMD Ventures ([TechCrunch](https://techcrunch.com/2026/02/10/ai-video-startup-runway-raises-315m-at-5-3b-valuation-eyes-more-capable-world-models/), [Bloomberg](https://www.bloomberg.com/news/articles/2026-02-10/ai-video-startup-runway-valued-at-5-3-billion-with-new-funding)) |

Total raised is roughly **$1.1–1.2B** *(my estimate from the rows above; unverified)*. **Premji Invest**, an Indian investor, is in the cap table, but I found no evidence of an India-specific product push.

**Team:** about **140 people** across research, engineering and go-to-market as of Feb 2026, with plans to hire ([TechCrunch](https://techcrunch.com/2026/02/10/ai-video-startup-runway-raises-315m-at-5-3b-valuation-eyes-more-capable-world-models/)).

### Who uses it

- **Studios and media:**
  - **Lionsgate** (Sept 2024). Runway trained a custom model on Lionsgate's film and TV library for pre-vis, storyboarding and final-frame work. Lionsgate later took an equity stake ([Runway news](https://runway.com/en/news/runway-partners-with-lionsgate), [IBC](https://ibc.org/artificial-intelligence/news/lionsgate-takes-stake-in-ai-firm-runway/22794)). A one-year retrospective says the results have been more modest than the launch hype ([3DVF](https://3dvf.com/en/generative-ai-one-year-later-the-runway-lionsgate-alliance-faces-reality/)).
  - **AMC Networks** (June 2025), for marketing imagery and pre-visualisation ([TheWrap](https://www.thewrap.com/amc-networks-ai-runaway-artificial-intelligence-partnership/)).
  - **Netflix** was reported by Bloomberg to be using Runway tools. This is not an announced partnership, and reports conflict on whether it was used for *El Eternauta* ([TechRadar](https://www.techradar.com/streaming/disney-and-netflix-are-quietly-using-the-same-generative-ai-startup-heres-why-the-rest-of-hollywood-is-circling)).
  - **IMAX** screened selections from Runway's **AI Film Festival** ([Deadline](https://deadline.com/2025/07/imax-runway-screenings-ai-film-festival-selections-1236468521)).
- **Agencies and enterprise marketing:** Runway Agent 2.0 (June 2026) is pitched as creating "entire campaigns… across platforms, formats and markets" ([Digg / changelog summary](https://digg.com/tech/epc6m2rq), [valmera review](https://valmera.io/blog/runway-review)).
- **Creators and prosumers:** the web app plus **iOS** (and, according to a May 2026 Runway post, **Android**; *unverified*) ([App Store](https://apps.apple.com/bs/app/id1665024375), [help: mobile features](https://help.runwayml.com/hc/en-us/articles/15940483005203-Mobile-features)).
- **Robotics and simulation:** GWM Robotics generates synthetic training data ([Runway research](https://runway.com/research/introducing-runway-gwm-1)).

---

## 2. Product lineup (as of October 2026)

### Video generation models

| Model | Status | What it does | Notes |
|---|---|---|---|
| **Gen-4.5** | **Current flagship** (launched Dec 2025; on API since 10 Feb 2026) | Text-to-video and image-to-video | 2–10 s, 720p per the API schema, 9:16 supported. Native audio was added in-app per some sources; the API has no audio parameter *(conflicting)*. Dec 2025 update added **multi-shot** editing ([The Decoder](https://the-decoder.com/runway-unveils-first-general-world-model-alongside-major-gen-4-5-upgrades/), [Runway models doc](https://docs.dev.runwayml.com/guides/models/)) |
| **Gen-4 Turbo** | Current (budget) | Image-to-video | 5 or 10 s, 720p, cheapest Runway-native model ([help: Gen-4](https://help.runwayml.com/hc/en-us/articles/37327109429011-Creating-with-Gen-4)) |
| Gen-4 | Legacy but available | Image-to-video with reference consistency | The help center flags it as an "older generation" |
| **Aleph 2.0** (`aleph2`) | **Current** (2 June 2026) | In-context **video-to-video editing**: restyle, add or remove objects, relight, change camera angle. Supports keyframe guidance | Input video 2–30 s, up to 5 keyframe images ([models doc](https://docs.dev.runwayml.com/guides/models/)) |
| Gen-4 Aleph (`gen4_aleph`) | **Removed from API on 30 July 2026** | Replaced by Aleph 2.0 | [API changelog](https://docs.dev.runwayml.com/api-details/api_changelog/) |
| Gen-3 Alpha / Alpha Turbo | **Removed from API on 30 July 2026** | Legacy | [API changelog](https://docs.dev.runwayml.com/api-details/api_changelog/) |
| **Act-Two** | Current | Performance capture: a driving video of a person animates a character (face, body, hands) | Successor to **Act-One**, which is discontinued or superseded ([scriptbyai timeline](https://www.scriptbyai.com/runway-ai-timeline/)) |
| **GWM-1** (Worlds / Avatars / Robotics) | Current, research or early product | World model built on Gen-4.5: explorable worlds, speaking avatars with lip sync, robotics simulation; reported output 24 fps, 720p | [Runway research](https://runway.com/research/introducing-runway-gwm-1), [Data Phoenix](https://dataphoenix.info/news/runway-launches-gwm-1-models-for-worlds-simulation-robotics-and-avatar-creation) |
| **Runway Characters** | Current (Mar 2026) | Real-time conversational video characters from one reference image, built on GWM-1, run over WebRTC sessions of up to 5 minutes | [timeline](https://www.scriptbyai.com/runway-ai-timeline/), [API directory](https://providers.apievangelist.com/providers/runway/) |
| GWM Worlds 2 | Research preview (Sept 2026) | Real-time audio-video world simulation | *Unverified* ([timeline](https://www.scriptbyai.com/runway-ai-timeline/)) |

### Image and other models

- **Gen-4 Image / Gen-4 Image Turbo:** text-to-image with **References**. You tag up to a few reference images, such as a character, product or location, so they stay consistent across outputs ([models doc](https://docs.dev.runwayml.com/guides/models/)).
- **Runway Ruby:** a color-grading model available in Tool Mode and Workflows ([changelog](https://runway.com/changelog)).
- **Third-party models on Runway, in the app and on the API:**
  - Google **Veo 3.1 / 3.1 Fast**
  - **Kling 2.5 Turbo Pro** and **Kling 4.0** (API, 23 Oct 2026)
  - ByteDance **Seedance 2.x**, which has a 480p "draft mode"
  - **Seedream 5.0 Flash**
  - **Ideogram 4.0/4.5**
  - **Wan 3.0**, in Tool Mode (Aug 2026)
  - Google **Nano Banana Pro** in the iOS app
  - **Grok Imagine Video** *(unverified)*

  Sources: [API changelog](https://docs.dev.runwayml.com/api-details/api_changelog/), [thismonthinai](https://thismonthinai.com/updates/runway), [App Store](https://apps.apple.com/bs/app/id1665024375).
- **Audio, via ElevenLabs on the Runway API:**
  - Multilingual v2 **TTS** (29 languages, *including Hindi, Tamil and Arabic* per ElevenLabs' language list)
  - **Sound effects**
  - **Voice dubbing**

  Sources: [rw-integrate-audio skill listing](https://mcpservers.org/ko/agent-skills/runwayml/rw-integrate-audio), [LiteLLM docs](https://docs.litellm.ai/docs/providers/runwayml/text-to-speech).

### Tools in the app

- Text-to-video, image-to-video and video-to-video (Aleph).
- Camera controls: directional and zoom moves on Gen-4 and Gen-4 Turbo.
- Keyframes (first and last frame).
- Expand video (outpainting to other aspect ratios).
- **Upscale to 4K** (`upscale_v1`).
- **Enhance Frame Rate** (frame interpolation; API, Sept 2026).
- Lip sync.
- Act-Two.
- Remove background / green screen, inpainting and object removal. These are legacy "AI Magic Tools" and are now mostly absorbed into Aleph *(the current status of each legacy tool is unverified)*.
- A timeline editor.

### Agent and workflow features (the important 2026 change)

- **Runway Agent** shipped on 13 May 2026, as a productised version of Gen-4 "Chat Mode". **Agent 2.0** followed on 25 June 2026. It does multi-step campaigns, analyses data, and adapts creative across formats and markets ([freevisualtools](https://freevisualtools.com/blog/runway-agent/), [valmera](https://valmera.io/blog/runway-review)).
- **Agent Skills** (2 July 2026) are slash-command skills, and custom skills are supported. A **timeline in Agent** lets it assemble edits ([aitooladvi](https://aitooladvi.com/2026/07/26/runways-july-2026-update-agent-skills-reviewed/)).
- **Workflows** are node-based pipelines. From 24 July 2026 the Agent can build, edit and run Workflows from natural language. Workflows are also exposed through **MCP**, so external agents can list and run them ([changelog](https://runway.com/changelog)).

---

## 3. How it works for a user

1. **Pick a mode:**
   - **Agent/Chat**: describe what you want and the agent plans and generates.
   - **Tool Mode**: choose a model, add a prompt and optional reference images or video.
   - **Workflows**: a node graph you can re-run.
2. **Set the inputs.** You choose the model, aspect ratio, duration and seed, plus any references: a start or end keyframe, a character reference, or a driving performance for Act-Two.
3. **Generate.** Credits are deducted when the job starts, and **failed or unsatisfying generations still cost credits** ([vantaige](https://vantaige.io/ai-tool/runway)). One vendor FAQ gives a typical Gen-4.5 time of about **30–60 s** per clip *(unverified)*. Gen-4 Turbo is faster.
4. **Iterate.** You can extend, re-roll, edit with Aleph, upscale to 4K and interpolate frames.
5. **Assemble** in the timeline or the agent timeline, then export. **The free tier adds a watermark and has no commercial licence** ([creatify](https://creatify.ai/blog/runway-pricing-(2026)-plans-credits-and-what-you-ll-actually-pay)).

### Key specs for vertical reels

| Spec | Gen-4.5 | Gen-4 Turbo | Aleph 2.0 |
|---|---|---|---|
| Clip length | 2–10 s (default 5) ([Cloudflare schema](https://developers.cloudflare.com/ai/models/runwayml/gen-4.5/index.md)) | 5 or 10 s | Input of 2–30 s |
| Native resolution | **720p** (1280×720 / **720×1280**); some vendors claim 1080p *(conflicting)* | 720p | Follows the input *(unverified)* |
| 9:16 | **Yes** | Yes | Yes |
| Other aspect ratios | 16:9, 1:1, 4:3, 3:4, 21:9 | Similar | n/a |
| Audio | API: none. In-app native audio claimed since May 2026 *(unverified)* | None | n/a |
| 4K | Only via upscale, a separate paid step | Same | Same |

### Consistency features

- Gen-4 / Gen-4 Image **References** keep a character or product consistent from a single image.
- Gen-4.5 **multi-shot** keeps the same characters across shots, and some sources mention 1-minute multi-shot sequences.
- **Act-Two** gives performance-driven consistency.
- Reviewers say text rendering inside the video and hands are still weak spots ([buildmvpfast](https://www.buildmvpfast.com/blog/ai-video-generation-api-sora-veo-runway-developer-2026), [diyai](https://diyai.io/ai-tools/video-generation/runway-vs-kling-vs-luma-vs-sora/)).

---

## 4. Pricing (found October 2026)

### App subscription plans

| Plan | Monthly | Annual (per month) | Credits / month | Gen-4.5 seconds at 12 cr/s | Notes |
|---|---|---|---|---|---|
| Free | $0 | – | 125 (**one-time**) | about 10 s | Watermark, no commercial use |
| Standard | **$15** (₹1,425) | $12 (₹1,140) | 625 | about 52 s | Credits expire monthly |
| Pro | **$35** (₹3,325) | $28 (₹2,660) | 2,250 | about 187 s | Credits expire monthly |
| **Max** (replaced Unlimited around 1 June 2026) | **$95** (₹9,025) | $76 (₹7,220) | 9,500 | about 790 s (13 min) | One-month rollover; **no Explore Mode** (unlimited relaxed queue) for new subscribers |
| Team / Enterprise | Custom | Custom | Custom | – | SSO, affirmative output-ownership clause, training opt-out |

Sources: [creatify](https://creatify.ai/blog/runway-pricing-(2026)-plans-credits-and-what-you-ll-actually-pay), [flexprice timeline](https://flexprice.io/pricing-index/runway), [creatide on Max](https://creatide.ai/blog/runway-unlimited-is-ending-is-the-new-max-plan-worth-it-for-ai-video-creators), [beststacked](https://beststacked.com/reviews/runway).

Caveats:
- Some sources list Standard and Pro at **$12 and $28 monthly** instead of annual-billed prices ([fluxnote](https://fluxnote.io/guides/runway-pricing-breakdown-2026)). *Plan prices are partly unverified.*
- Sources give different dates for when legacy Unlimited users migrate: 1 Sept 2026 or 30 Nov 2026.
- **Effective app credit price:** Standard ≈ $0.024/credit, Pro ≈ $0.0156, Max ≈ $0.010. This matches the API price.

### Credit costs per second (app and API use the same rates; **1 API credit = $0.01**)

| Model | Credits / s | API $ / s | ₹ / s | Minimum |
|---|---|---|---|---|
| **Gen-4.5** | **12** (was 25 until about mid-June 2026) | **$0.12** | ₹11.4 | – |
| Gen-4 (base) | 12 | $0.12 | ₹11.4 | – |
| **Gen-4 Turbo** | **5** | **$0.05** | ₹4.75 | 10 credits |
| Aleph 2.0 | 28 | $0.28 | ₹26.6 | 56 credits ($0.56) |
| Act-Two | 5 | $0.05 | ₹4.75 | 15 credits |
| Veo 3.1 (with audio / without) | 40 / 20 | $0.40 / $0.20 | ₹38 / ₹19 | – |
| Veo 3.1 Fast (with audio) | 15 | $0.15 | ₹14.3 | – |
| Kling 2.5 Turbo Pro | 12 | $0.12 | ₹11.4 | – |
| Seedance 2.x | 14–30 *(versions conflict)* | $0.14–0.30 | – | 56–80 credits |
| Upscale v1 (4K) | 2 | $0.02 | ₹1.9 | – |
| Gen-4 Image | 5 (720p) / 8 (1080p) per image *(unverified)* | $0.05 / $0.08 | ₹4.75 / ₹7.6 | – |
| ElevenLabs sound effects / dubbing | about 1–2 credits per call / 1 credit per 2 s *(unverified)* | about $0.01–0.02 | – | – |

Sources:
- [Runway API pricing doc](https://docs.dev.runwayml.com/guides/pricing/) and [dev.runway.com/pricing](https://dev.runway.com/pricing), as indexed by search
- [help: Gen-4](https://help.runwayml.com/hc/en-us/articles/37327109429011-Creating-with-Gen-4)
- [developersdigest](https://www.developersdigest.tech/models/video-generation/runway)
- [toolcolumn](https://www.toolcolumn.com/learn/runway-web-credits-vs-api-pricing)
- The Gen-4.5 cut from 25 to 12 credits/s is dated 14–21 June 2026 by [flexprice](https://flexprice.io/pricing-index/runway) *(single-source date)*.

**API billing terms:** prepaid credits, with a reported **$10 minimum top-up**. API credits are **separate** from app subscriptions and can't be shared between them. There is no subscription ([apiframe](https://apiframe.ai/blog/best-runway-api-providers-2026)).

**Rate limits:** Runway uses **per-model concurrency limits** under usage tiers that rise as you spend. I found **no published numbers** *(unverified)*. The **Model Router** (23 July 2026) lets you exceed per-model concurrency by routing to other models under cost caps and allow/deny lists ([API changelog](https://docs.dev.runwayml.com/api-details/api_changelog/)).

---

## 5. Developer API (Runway Dev)

**Base and auth.** REST API at `api.dev.runwayml.com`. Each request needs a Bearer API key and an `X-Runway-Version` header; `2024-11-06` is the documented version ([CometAPI mirror of the official format](https://apidoc.cometapi.com/api/video/runway/official-format/runway-to-get-task-details.md)).

**Endpoints:**
- `POST /v1/text_to_video`
- `POST /v1/image_to_video`
- `POST /v1/video_to_video` (Aleph)
- `POST /v1/character_performance` (Act-Two)
- `POST /v1/text_to_image`
- `POST /v1/video_upscale`
- Audio: `/v1/text_to_speech`, `/v1/sound_effect`, `/v1/voice_dubbing`
- Real-time avatar sessions (Characters)

Exact paths are partly *unverified*: they are inferred from SDK and skill listings.

**Async model.** A `POST` returns a task `id`. You then poll `GET /v1/tasks/{id}` until the status reaches `SUCCEEDED` or `FAILED`; a status of `PENDING`, `THROTTLED` or `RUNNING` means it is still in progress. On success the `output` array holds **temporary signed URLs, so download and re-host them right away**. The exact expiry window is not confirmed. The SDKs include a `waitForTaskOutput()` helper. A brand-new task can briefly return "not found", so retry ([CometAPI](https://www.cometapi.com/pt/how-to-add-ai-video-generation-to-a-saas-app/)).

**SDKs.** Official **Node.js/TypeScript** (`@runwayml/sdk`) and **Python** (`runwayml`) libraries ([models doc](https://docs.dev.runwayml.com/guides/models/)). There are also official **agent skills** and an MCP interface for Workflows. Runway models are resold by Replicate, Runware, Krea, Cloudflare Workers AI (Gen-4.5 appears in [Cloudflare's model catalog](https://developers.cloudflare.com/ai/models/runwayml/gen-4.5/index.md)), CometAPI and others.

> **Note for Reelkar:** Gen-4.5 appears in the Cloudflare AI model catalogue. If you can call it through your existing Cloudflare stack, the integration cost drops. Pricing there may differ from Runway's; *verify*.

**Content moderation.** Runway moderates inputs and outputs by default, and **too many moderated requests lead to account suspension**. Runway itself tells developers to add their own moderation before calling the API. A `contentModeration` object can relax checks for recognisable public figures in permitted contexts ([moderation doc](https://docs.dev.runwayml.com/api-details/moderation)).

**Ownership and commercial use.** Runway's terms say it **claims no ownership of inputs or outputs** and **does not restrict commercial use** of outputs, subject to the Terms and the Usage Policy ([Terms of Use](https://runway.com/terms-of-use), [help: commercial use](https://help.runwayml.com/hc/en-us/articles/21668707517587-Can-I-use-the-content-I-made-in-Runway-for-commercial-purposes), [dev: commercial use](https://dev.runwayml.com/learn/commercial-use)). Outputs on the free app tier are not cleared for commercial use. Enterprise terms *affirmatively* assign ownership of outputs to the customer ([terms.law analysis](https://terms.law/ai-output-rights/runway/)). Secondary analyses say Runway may use inputs and outputs to train models below the Enterprise tier, with no opt-out *(unverified against the primary text)*.

**Provenance.** Secondary sources say **all Runway outputs carry C2PA metadata**, and possibly an invisible watermark ([vorplabs registry](https://vorplabs.com/models/media-rights), [buildmvpfast](https://www.buildmvpfast.com/blog/ai-video-generation-copyright-crisis-sora-veo-runway-2026)) *(unverified)*. Instagram and YouTube read C2PA and may automatically add an "AI info" or "altered or synthetic" label.

---

## 6. Strengths and weaknesses against alternatives, for short-form social video

### Runway: strengths

- Polished, controllable cinematic shots, with good camera control and prompt adherence.
- Strong editing of **existing footage** (Aleph 2.0). That is rare, and it is directly relevant to "edit my own filmed video".
- The best **creator workflow** layer: Agent, Workflows, Skills and MCP.
- One API gives access to many vendors' models, plus a Model Router.
- A clean commercial-use stance, enterprise trust and Hollywood credibility.

### Runway: weaknesses

- **720p native**, with 4K only via a paid upscale.
- **No native audio on Gen-4.5 in the API.** Veo 3.1 has audio but costs 3–4x more.
- Clips are short (≤10 s per generation).
- Failed generations still burn credits.
- Text in the video and hands are still weak.
- The plans are expensive for Indian consumers (₹1,425–9,025 per month), and **credits don't roll over** below Max.
- The pricing has changed often, including a model being dropped from 25 to 12 credits/s and the Unlimited plan being removed. That makes it a planning risk.

### Comparison table

Assumes 30 s of fully generated motion: 3×10 s or 6×5 s clips at 720p, with no retries. Prices are API list prices found in Sept–Oct 2026.

| Engine (where) | $/s | 30 s reel | ₹ / 30 s | Audio | Max clip | Social-video notes |
|---|---|---|---|---|---|---|
| **Runway Gen-4 Turbo** (Runway API) | $0.05 | **$1.50** | ₹143 | No | 10 s | Image-to-video only. Good for animating FLUX stills |
| **Runway Gen-4.5** (Runway API) | $0.12 | **$3.60** | ₹342 | No (API) | 10 s | Top motion quality, 720p |
| Runway Aleph 2.0 (restyle your own 30 s clip) | $0.28 | $8.40 | ₹798 | Keeps the source audio | 30 s input | Unique "edit my footage" ability |
| Veo 3.1 (Google, or via Runway/fal) | $0.40 with audio | $12.00 | ₹1,140 | **Yes** | 8 s (extendable) | Best native audio and dialogue. Expensive |
| Veo 3.1 Fast / Lite | $0.15 / about $0.05 | $4.50 / $1.50 | ₹428 / ₹143 | Yes | 8 s | Lite is very competitive *(Lite price unverified)* |
| **Kling 3.0 Std / Pro** (fal) | $0.084 / $0.112–0.14 | **$2.52** / $3.36–4.20 | ₹239 / ₹319–399 | Pro: yes *(unverified)* | 10–15 s | Strong motion for the price. Kling 4.0 now also on Runway |
| **Wan 2.6** (fal) 720p / 1080p | $0.10 / $0.15 | $3.00 / $4.50 | ₹285 / ₹428 | Some variants | 10–15 s | Open weights, so it can be self-hosted later |
| Wan 3.0 (fal) 480p / 720p | $0.05 / $0.10 | $1.50 / $3.00 | ₹143 / ₹285 | – | – | 30% launch discount reported |
| MiniMax H3 (Hailuo successor) 768p | $0.08 | $2.40 | ₹228 | – | 10 s | Hailuo 2.3 is now legacy |
| Seedance 2.x (ByteDance) | $0.14–0.30 | $4.20–9.00 | ₹399–855 | Yes (2.5) | 10–15 s | 480p draft mode for cheap previews |
| Luma Ray3 / Ray3.14 | **Unverified** | – | – | – | – | Billed per second by resolution |
| Pika | **Unverified** (no 2026 API pricing found) | – | – | – | – | Consumer-app focus |
| **OpenAI Sora 2** | **Discontinued** | – | – | – | – | App closed 26 Apr 2026, API retired 24 Sept 2026 ([OpenAI help](https://help.openai.com/en/articles/20001152-what-to-know-about-the-sora-app-discontinuation), [The Decoder](https://the-decoder.com/openai-sets-two-stage-sora-shutdown-with-app-closing-april-2026-and-api-following-in-september/)) |

Sources: [teamday Sep 2026](https://www.teamday.ai/blog/ai-api-pricing-comparison-2026), [devtk](https://devtk.ai/en/blog/ai-video-generation-pricing-2026/), [invideo Aug 2026](https://invideo.io/blog/ai-video-model-pricing), [usagepricing (MiniMax H3)](https://www.usagepricing.com/blueprint/activity/minimax-2026-07-30-h3-video-per-second), [minimax-ai.chat](https://minimax-ai.chat/?p=251), [andrew.ooo](https://andrew.ooo/answers/runway-gen-4-5-vs-veo-3-1-vs-kling-3/), [diyai](https://diyai.io/ai-tools/video-generation/runway-vs-kling-vs-luma-vs-sora/).

**Realistic cost per reel.** In practice you re-roll about 30–50% of shots, so multiply the figures by **1.3–1.5x**. That gives a fully generated 30 s Gen-4.5 reel at about **$4.70–5.40 (₹450–515)**, and Gen-4 Turbo at about **$2.00–2.25 (₹190–215)**.

**A cheaper "hybrid" reel** matches Reelkar's story-reel format. Use FLUX stills with Ken Burns moves plus Kokoro narration, and animate only **4 hero shots of 5 s each**:

| Engine for the hero shots | Cost of 20 s of motion | In INR |
|---|---|---|
| Gen-4 Turbo | **$1.00** | ₹95 |
| Gen-4.5 | **$2.40** | ₹228 |
| Kling 3.0 Std | about $1.70 | ₹160 |
| Wan 3.0 480p | about $1.00 | ₹95 |

---

## 7. What this means for Reelkar

### Should Reelkar integrate the Runway API as a premium tier?

**Not as the primary premium engine. Yes as an optional, switchable engine behind an abstraction layer.**

1. **Cost.** Runway Gen-4.5 at $0.12/s costs about the same as Kling 3.0 Pro and Wan 2.6 on fal, and more than Kling Standard or Wan 3.0 480p. Gen-4 Turbo at $0.05/s matches the cheapest fal options, but it is older-generation quality. Runway has **no price advantage** to justify a second vendor relationship on day one.
2. **Audio.** Reelkar already generates narration with Kokoro TTS. Gen-4.5's lack of API audio is therefore *not* a problem for story reels. It does rule Gen-4.5 out for any "talking character" use case.
3. **Resolution.** 720p is fine for Reels and Shorts, which are compressed heavily anyway. A 1080p export can come from a cheap upscale (Runway `upscale_v1` at $0.02/s, or your own).
4. **Where Runway is genuinely unique: Aleph 2.0.** It can restyle, relight, swap backgrounds and remove objects in a **creator's own filmed clip**. That maps directly onto Reelkar's "edit my video" mode. At $0.28/s, a 15 s restyle costs **$4.20 (₹400)**, so price it as a per-use add-on, not something included in a plan.
5. **Runway Dev as an aggregator.** Runway now resells Kling 4.0, Veo 3.1, Seedance and ElevenLabs, and adds a Model Router. It is a credible **alternative or backup to fal.ai**. That matters for redundancy, but don't use two aggregators until volume justifies it.

**Suggested premium pricing.** If a "Premium reel" spends about ₹100–230 on generation through the hybrid approach, you need to charge about **₹299–499 per premium reel**, or bundle **3–5 premium reels in a ₹999 per month plan**, to keep 50%+ gross margin. A fully generated 30 s Gen-4.5 reel (about ₹450–515 in cost) can't be sold to Indian consumers at a profit. Keep it for Gulf creators or B2B and agency customers.

### Features worth copying

- **Agent + Workflows.** Use a chat-driven agent that builds a reusable "recipe" (a node graph) and can re-run it. This would make Reelkar's agent more than a one-shot generator. For example: "make my weekly Diwali offer reel in the same style".
- **References and character lock.** Keep one character or product reference across all shots in a story reel. Reelkar can approximate this cheaply with FLUX image-reference conditioning (Redux / IP-Adapter style) before animating.
- **Draft mode.** Generate a cheap low-res preview, then do the final render only once the user approves it. This is Seedance's 480p draft mode on Runway, and it cuts wasted spend from re-rolls.
- **Keyframe start/end control and camera presets** (dolly, orbit, zoom), shown as simple buttons rather than prompt syntax.
- **Multi-shot consistency** framed as "scenes" in a story.
- **Model routing:** an internal router that picks Kling, Wan or Runway by cost or quality per shot, with per-user cost caps.

### Where Reelkar can differentiate

- **Indian and Gulf languages end-to-end:**
  - Hindi, Tamil, Telugu, Bengali, Marathi, Malayalam, Kannada, Gujarati, Punjabi, Arabic (Gulf dialect) and Hinglish
  - Scripts, captions in native scripts (Devanagari, Tamil, Arabic RTL) and voice
  - Runway has nothing comparable. Its only multilingual audio is ElevenLabs TTS and dubbing.
- **Posting and scheduling to Instagram and YouTube**, plus performance feedback. Runway's Agent 2.0 talks about "campaigns" but does not publish to social accounts *(as far as found)*.
- **Price:** standard reels near-free, premium at ₹ price points, UPI and local payments. Runway's ₹1,425–9,025 per month is out of reach for most Indian creators.
- **Mobile-first templates for local formats:** festival content, local commerce, devotional, cricket, Bollywood-style edits (with no copyrighted assets), real-estate and Gulf retail promos.
- **Workflow speed:** one tap from idea to scheduled post, against Runway's pro-tool learning curve.

### Licensing and brand-safety concerns

- **Moderation-driven suspension.** Runway suspends accounts that trigger moderation too often. A multi-tenant app sends all its users through **one** API key, so **you must pre-moderate prompts and images**, using Workers AI Llama Guard or similar, before calling Runway (or fal).
- **Training on your users' content.** On non-Enterprise tiers, Runway may use inputs and outputs for training and product improvement *(unverified)*. That could conflict with Reelkar's privacy policy for creators' own footage, especially with Aleph. Disclose it, or negotiate Enterprise terms.
- **C2PA and AI labels.** Runway outputs likely carry C2PA. Meta and YouTube may auto-label posts "AI info", and Indian rules on labelling synthetic content are tightening. MeitY proposed amendments to the IT Rules in Oct 2025; *check their final status*. Treat this as a feature: label AI content consistently across *all* engines.
- **Likeness and public figures.** Don't relax `contentModeration` for public figures. Political or celebrity deepfakes are a major legal and PR risk in India and the GCC (UAE and KSA have strict laws on defamation and content).
- **Commercial use** is fine on paid API usage. Make sure your ToS passes the rights through to users and bans prohibited uses that mirror Runway's Usage Policy.
- **Vendor churn risk.** Sora was shut down, Gen-3 and Aleph v1 were retired, and plans and prices change mid-year. Keep every video provider swappable.

### Recommendation (clear)

1. **Now:**
   - Keep the **standard tier** on Cloudflare Workers AI + FLUX + Kokoro: stills, motion graphics and Ken Burns.
   - Keep the **premium tier on fal.ai**, with **Kling 3.0 Standard or Wan 3.0** as the default hero-shot animator, at about ₹95–160 per reel for 20 s of motion.
2. **Next 2–4 weeks:**
   - Build a `VideoProvider` interface that covers submit, poll, cost estimate and moderation.
   - Run a **blind A/B on 50 Indian-context prompts** against Runway **Gen-4 Turbo** and **Gen-4.5**, through Runway's API or Cloudflare's catalogue entry if the price is the same.
   - Add Runway as the **"Cinematic"** option only if it wins clearly on faces, motion and Indian settings.
3. **Later (product bet):**
   - Pilot **Aleph 2.0** for an "AI restyle my clip" paid add-on (about ₹400 per 15 s of cost, priced at ₹699+), aimed at Gulf and agency users first.
4. **Don't:**
   - Resell Runway's full-generation pipeline as an Indian consumer plan.
   - Rely on Runway for audio.
   - Make Runway a single point of failure.

---

## Sources

**Runway primary pages** (seen through search indexing; direct fetch was blocked in this session):
- [Runway pricing](https://runwayml.com/pricing)
- [Runway API pricing docs](https://docs.dev.runwayml.com/guides/pricing/)
- [dev.runway.com/pricing](https://dev.runway.com/pricing)
- [Runway API: available models](https://docs.dev.runwayml.com/guides/models/)
- [Runway API changelog](https://docs.dev.runwayml.com/api-details/api_changelog/)
- [Runway API content moderation](https://docs.dev.runwayml.com/api-details/moderation)
- [Runway Dev: commercial use](https://dev.runwayml.com/learn/commercial-use)
- [Runway product changelog](https://runway.com/changelog)
- [Runway research: GWM-1](https://runway.com/research/introducing-runway-gwm-1)
- [Runway Terms of Use](https://runway.com/terms-of-use)
- [Runway news: Lionsgate partnership](https://runway.com/en/news/runway-partners-with-lionsgate)
- [Help: Creating with Gen-4](https://help.runwayml.com/hc/en-us/articles/37327109429011-Creating-with-Gen-4)
- [Help: commercial use](https://help.runwayml.com/hc/en-us/articles/21668707517587-Can-I-use-the-content-I-made-in-Runway-for-commercial-purposes)
- [Help: usage rights](https://help.runwayml.com/hc/en-us/articles/18927776141715-Usage-rights)
- [Help: mobile features](https://help.runwayml.com/hc/en-us/articles/15940483005203-Mobile-features)
- [Runway iOS app (App Store)](https://apps.apple.com/bs/app/id1665024375)

**Press:**
- [TechCrunch: Runway raises $315M at $5.3B (Feb 2026)](https://techcrunch.com/2026/02/10/ai-video-startup-runway-raises-315m-at-5-3b-valuation-eyes-more-capable-world-models/)
- [Bloomberg: Runway valued at $5.3B](https://www.bloomberg.com/news/articles/2026-02-10/ai-video-startup-runway-valued-at-5-3-billion-with-new-funding)
- [Wikipedia: Runway (company)](https://en.wikipedia.org/wiki/Runway_(company))
- [The Decoder: GWM-1 and Gen-4.5 upgrades](https://the-decoder.com/runway-unveils-first-general-world-model-alongside-major-gen-4-5-upgrades/)
- [Videomaker: GWM-1](https://www.videomaker.com/news/runway-announces-its-ai-general-world-model-gwm-1/)
- [Data Phoenix: GWM-1 models](https://dataphoenix.info/news/runway-launches-gwm-1-models-for-worlds-simulation-robotics-and-avatar-creation)
- [IBC: Lionsgate takes stake](https://ibc.org/artificial-intelligence/news/lionsgate-takes-stake-in-ai-firm-runway/22794)
- [3DVF: Lionsgate deal one year later](https://3dvf.com/en/generative-ai-one-year-later-the-runway-lionsgate-alliance-faces-reality/)
- [TheWrap: AMC Networks](https://www.thewrap.com/amc-networks-ai-runaway-artificial-intelligence-partnership/)
- [TechRadar: Netflix/Disney usage](https://www.techradar.com/streaming/disney-and-netflix-are-quietly-using-the-same-generative-ai-startup-heres-why-the-rest-of-hollywood-is-circling)
- [Deadline: IMAX AI Film Festival](https://deadline.com/2025/07/imax-runway-screenings-ai-film-festival-selections-1236468521)
- [OpenAI help: Sora discontinuation](https://help.openai.com/en/articles/20001152-what-to-know-about-the-sora-app-discontinuation)
- [The Decoder: Sora shutdown timeline](https://the-decoder.com/openai-sets-two-stage-sora-shutdown-with-app-closing-april-2026-and-api-following-in-september/)

**Third-party pricing, specs and reviews** (secondary; used for cross-checking):
- [creatify: Runway pricing 2026](https://creatify.ai/blog/runway-pricing-(2026)-plans-credits-and-what-you-ll-actually-pay)
- [flexprice: Runway pricing index](https://flexprice.io/pricing-index/runway)
- [creatide: Max vs Unlimited](https://creatide.ai/blog/runway-unlimited-is-ending-is-the-new-max-plan-worth-it-for-ai-video-creators)
- [beststacked review](https://beststacked.com/reviews/runway)
- [fluxnote pricing](https://fluxnote.io/guides/runway-pricing-breakdown-2026)
- [apiframe: Runway API providers](https://apiframe.ai/blog/best-runway-api-providers-2026)
- [developersdigest: Runway](https://www.developersdigest.tech/models/video-generation/runway)
- [toolcolumn: web vs API credits](https://www.toolcolumn.com/learn/runway-web-credits-vs-api-pricing)
- [vantaige review](https://vantaige.io/ai-tool/runway)
- [Cloudflare: Runway Gen-4.5 model page](https://developers.cloudflare.com/ai/models/runwayml/gen-4.5/index.md)
- [runware: Gen-4.5](https://runware.ai/docs/models/runway-gen-4-5)
- [scriptbyai: Runway timeline](https://www.scriptbyai.com/runway-ai-timeline/)
- [thismonthinai: Runway updates](https://thismonthinai.com/updates/runway)
- [freevisualtools: Runway Agent](https://freevisualtools.com/blog/runway-agent/)
- [valmera review](https://valmera.io/blog/runway-review)
- [aitooladvi: Agent Skills](https://aitooladvi.com/2026/07/26/runways-july-2026-update-agent-skills-reviewed/)
- [Digg: Runway Agent workflows](https://digg.com/tech/epc6m2rq)
- [CometAPI: Runway task API](https://apidoc.cometapi.com/api/video/runway/official-format/runway-to-get-task-details.md)
- [CometAPI: SaaS integration guide](https://www.cometapi.com/pt/how-to-add-ai-video-generation-to-a-saas-app/)
- [mcpservers: rw-integrate-audio](https://mcpservers.org/ko/agent-skills/runwayml/rw-integrate-audio)
- [LiteLLM: Runway TTS](https://docs.litellm.ai/docs/providers/runwayml/text-to-speech)
- [API Evangelist: Runway](https://providers.apievangelist.com/providers/runway/)
- [terms.law: Runway output rights](https://terms.law/ai-output-rights/runway/)
- [vorplabs: media rights registry](https://vorplabs.com/models/media-rights)
- [buildmvpfast: copyright](https://www.buildmvpfast.com/blog/ai-video-generation-copyright-crisis-sora-veo-runway-2026)
- [buildmvpfast: API comparison](https://www.buildmvpfast.com/blog/ai-video-generation-api-sora-veo-runway-developer-2026)
- [andrew.ooo: Gen-4.5 vs Veo 3.1 vs Kling 3](https://andrew.ooo/answers/runway-gen-4-5-vs-veo-3-1-vs-kling-3/)
- [diyai: Runway vs Kling vs Luma vs Sora](https://diyai.io/ai-tools/video-generation/runway-vs-kling-vs-luma-vs-sora/)
- [teamday: API pricing Sep 2026](https://www.teamday.ai/blog/ai-api-pricing-comparison-2026)
- [devtk: video API pricing](https://devtk.ai/en/blog/ai-video-generation-pricing-2026/)
- [invideo: model pricing Aug 2026](https://invideo.io/blog/ai-video-model-pricing)
- [usagepricing: MiniMax H3](https://www.usagepricing.com/blueprint/activity/minimax-2026-07-30-h3-video-per-second)
- [minimax-ai.chat: Hailuo pricing](https://minimax-ai.chat/?p=251)
- [aivideosensei: Luma Ray pricing](https://aivideosensei.com/guides/luma-ray-api-pricing)
- [fal: sync lipsync](https://fal.ai/models/fal-ai/sync-lipsync/v2)

**FX:**
- [poundsterlinglive USD-INR 2026](https://www.poundsterlinglive.com/history/USD-INR-2026)
- [fxfeed INR-USD](https://fxfeed.io/currencies/pairs/inr-usd?range=6m)
