# Community 3: Reel recipes that earn credits

Status: design spec v1, 2026-11-06. Not built. Follows PLAN.md decision 43 item 3 ("A finished reel can be shared as a recipe … 'Use this recipe' makes a new reel with the user's own photo and topic, and the recipe's maker earns a share of the credits spent"), decision 42 (credits are how Reelkar makes money) and decision 44 (Listen's handles, publish flow, public pages and Report).
Design system: v3.0 Masala Pop (`design/v3.0/tokens.json`); token names as in that file.
Mockups: `design/community/recipes-mockups.html` (clickable iPhone screens, the public recipe page at desktop and phone width, light/dark, English/Hindi/Arabic, reduced motion).
Shares one earnings model with remix chains (`design/community/remix-spec.md`, "Earnings (shared with recipes)"): one ledger reason `earning`, one `creator_earning` table, one Earnings screen.
Reuses: `design/community/flow-spec.md` (public-page shell, Report sheet and reasons, language rules, push), `design/listen/flow-spec.md` (handle picker P1, publish sheet pattern P2/P3, "Share on Listen" card, song page layout, rails). Builds with `mobile/src/components/ui.tsx` (`Screen`, `Header`, `Hero`, `Card`, `Button`, `Chip`, `ChipRow`, `Field`, `Banner`, `Status`, `Win`, `Credits`, `Skeleton`, `ListRow`, `Empty`), `reel-video.tsx`, `reel-thumb.tsx`, `song-rail.tsx`.

---

## Frame

- **Goal:** a creator who made a reel people like can let others make their own version in one tap, and earn credits each time. A new creator who doesn't know where to start begins from a recipe that already works, especially before a festival.
- **One job per screen:** Share as a recipe = see what's shared and what stays private, then share; Gallery = find a recipe for this week's festival; Recipe page = see the result, the price and what you need to bring; Create (with a recipe) = add your topic and photo, then make; Earnings = see what my recipes made.
- **Success metrics (first festival season):** 8% of finished reels that people post get shared as recipes; 20% of new creators' first reels start from a recipe; recipe reels finish (not abandoned in Create) 1.5× as often as blank Create; 30% of recipe uses are paid (AI animation or Cinematic); fewer than 1 report per 300 recipes.

## Decisions in one line each

1. **A recipe is a snapshot, not a link to the reel.** It's built once at publish from the reel's request and its saved script, stored as structured data, and replayed by the existing pipelines. *Why: the `film` row doesn't keep the script shape, motion ending or edit options; and a snapshot can't later leak something the maker adds to the reel.*
2. **Only replayable, non-personal things go in** (table below). Never a face, photo, saved character, cloned voice, uploaded video, the maker's words, brand kit or keyword.
3. **What you lock and what you change.** Locked: format, look, length, script shape, music, effects. Yours: topic, photo, language, quality (story reels), your brand kit. Changing a locked item means "Make it without the recipe", and the maker earns nothing. *Why: the maker should earn only when their recipe is actually used, and the user should always know which of the two they're making.*
4. **Earnings = 10% of the paid credits spent on a reel that finished**, paid as credits, using the **shared earnings model** with remix chains. "Paid" is counted **in proportion**: the share of what the payer has ever bought versus been granted (see Earnings). No balance buckets, no spend-order rules. Amounts are kept in hundredths of a credit; a granted earning is never taken back.
5. **The one anti-abuse rule we need:** your own uses never earn. Everything else is already safe because earnings come only from real money spent, and Reelkar always keeps 90% of it.
6. **Recipes live in Create** (a "Start from a recipe" rail and a festival card), **the gallery is a screen under Create**, and **earnings show on the one shared Earnings screen** (All · Remixes · Recipes), which replaces the Earn placeholder in Account.
7. **Name:** "Recipe" in English, **रेसिपी** in Hindi (everyone knows it from cooking reels), **وصفة** in Arabic. It fits Masala Pop and says "follow these steps, use your own ingredients".
8. **Music videos and Jugalbandi videos can't be shared as recipes in v1**: they're built around a song the maker owns. Remix chains (community feature 4) cover songs.

---

## What a recipe stores and what the user brings

A recipe stores a `spec` (jsonb, validated by `recipeSpecSchema`, `v: 1`), discriminated by format. Everything in it maps to a field the existing pipelines already accept.

| Format | The recipe keeps (locked) | Source today | The user brings |
|---|---|---|---|
| **Story with pictures** (`story`) | look (`style`), length (`durationSec` → shot count), suggested quality, **script shape** (one role and one abstract intent per shot, tone, pace), camera move per shot, **music** (the reel's background track, plus its `musicPrompt` as a fallback), captions on/off, `kidSafe` | `film.style/durationSec/quality/kidSafe`; `OUTPUT_DIR/<id>/script.json` (`shots[].motionPrompt`, `musicPrompt`); the track file in the work dir | **topic** (required), **their own photo** (optional; AI animation and Cinematic only, with the existing consent), **language**, quality (they can pick another; the price follows) |
| **Motion reel** (`motion`) | theme (`navy · saffron · mint · night`), **slide plan** (slide types in order, e.g. title → stat → list → contrast → cta), ending (`none · follow · comment · auto`), length, music (follows the theme, as today) | `script.json` (`theme`, `slides[].type`), job `ending` | **topic**, **language**, their own brand kit and comment word (from their prefs, as today) |
| **Kids dance** (`dance`) | scene, bpm, cartoon dancers' looks (skin, outfit, colour, hair; **not** names), move per chant line, number of lines, voice (`sung` free · `chant` free · `ai_song` 1 credit), length | dance `script.json` / job `danceVoice` | **topic** ("a rain dance", "brushing teeth"), **language**, dancer names (optional) |
| **Edit my video** (`edit`) | captions, zooms, effects, sounds, voice polish (`natural · clear · deeper`; audio processing, not a cloned voice), ending, **effect mix** (which effect types and card types, and how often, e.g. "a big word every ~8 s, stamps on 2 moments") | edit request + the saved edit plan's effect/card *types* (never their text or timings) | **their own video** (required, ≤ 60 s), **language they speak** |

**Script shape** (story) is written once at publish by the free text AI (decision 41) from the saved script, then shown to the maker before sharing:

```json
{ "tone": "warm", "pace": "quick",
  "shots": [
    { "role": "hook",   "intent": "Open on a surprising question about the topic", "camera": "slow push-in" },
    { "role": "beat",   "intent": "Show the everyday moment before the change",    "camera": "pan left to right" },
    { "role": "turn",   "intent": "Something unexpected happens",                   "camera": "quick zoom" },
    { "role": "payoff", "intent": "A warm ending that answers the opening question", "camera": "pull back" } ] }
```

Rules for the shape: roles from a fixed enum (`hook · beat · turn · payoff · cta`); `intent` and `camera` at most 80 characters, English, no names, numbers, places or brands (the writer is told; the existing text safety check runs on the result and fails closed); one entry per shot. English is what the prompt uses; people never read it raw. Role names are translated UI strings, and each intent's display text (`intentI18n`) is written in the maker's app language at draft time and in a viewer's language the first time it's viewed in that language (free text AI, cached on the recipe). At use time, `buildScriptPrompt` gets an extra block: "Follow this shape exactly: shot 1 is the hook: {intent} …", and `motionPrompt` starts from the shot's `camera`.

**Never stored, never shown:** the maker's idea text, narration, title as written in the reel (the recipe gets its own name), the characters list, a saved `characterId` or its reference picture, an uploaded photo, an uploaded video, faces, any voice clone, brand kit (accent, handle), comment keyword, lyrics, captions text, the post caption.

**Music:** the background track is an AI instrumental with no voice, so the recipe keeps a copy of it (`recipes/<id>/music.m4a`), and recipe reels use the same sound (like a trending audio). When the user's reel is a different length (edit recipes), the track loops or trims with a 1 s fade; if the file is missing, `musicPrompt` makes a new one.

**Preview:** the recipe page shows the maker's reel as the preview (a 480p copy, max 15 s, ~1 MB, plus a poster frame). For reels that show a real person (made with a photo, a saved character, or an edit of the maker's own video), the preview is **off by default** and the maker must turn it on, confirming the people in it agreed. With it off, the page shows a "look card" (the poster frame of a shot without people when one exists, otherwise the style swatch and the shape).

---

## Flows

```
Maker
  Finished reel (reel/[id])  →  "Share as a recipe" card
     └─ first time: Pick your name on Listen (Listen P1, reused: "Pick your @name")
     └─ Share as a recipe sheet:  What people get · What stays private · Name · Good for (festival) · Preview switch
          ├─ shape drafting (≈3 s skeleton)  ├─ draft fails → "Couldn't read this reel's script. Try again."
          └─ "Share recipe" → safety check
               ├─ pass → Recipe is live: link reelkar.app/r/{publicId} · Share link · See it
               └─ fail → inline reason, nothing shared
  Later: push "Someone made a reel with Diya Night · +6 credits"  →  Earnings (Recipes chip)
         Recipe page (maker view): uses, credits earned, Edit, Stop sharing

User (app)
  Create tab: festival card "Diwali in 2 days" + "Start from a recipe" rail  ─┐
  Home: seasonal card (3 weeks before a festival)                              ├→ Recipe page (app)
  Recipes gallery (recipes/index) → collection (recipes/c/[slug])            ─┘     │
  WhatsApp/Instagram link → web /r/{publicId} → "Use this recipe" → sign in ───────┤
                                                                                   ▼
            Create with the recipe (create?recipe={publicId}): recipe card (locked), topic, photo, language, price
              ├─ recipe taken down meanwhile → "Make it without the recipe"
              ├─ not enough credits → existing Get credits banner
              └─ "Make my reel · 72 credits" → Making (existing, "Recipe by @maker" line)
                    ├─ failed → existing refund; the maker earns nothing
                    └─ Reel ready (existing) · "Recipe by @maker" · caption credit on by default
                          → maker earns (completed, not own, paid share > 0)
```

## Screens (iPhone)

| # | Screen | Route | Reuses |
|---|---|---|---|
| M1 | Finished reel + "Share as a recipe" card | `reel/[id]` (existing) | new `ShareAsRecipeCard` (pattern of Listen's `ShareOnListenCard`) |
| M2 | Pick your @name (first time only) | sheet on `reel/[id]` | Listen P1 `HandleField` + handle API as is |
| M3 | Share as a recipe sheet | sheet on `reel/[id]` | Listen P2 sheet layout, `Field`, `ChipRow`, `Switch`, `Banner` |
| M4 | Recipe is live | same sheet | Listen P3, `Win`, native share sheet |
| M5 | Recipe page, maker view | `recipes/[publicId]` | U-page below + stats card |
| E1 | Earnings, Recipes chip (shared with remixes, remix X13) | `earn.tsx` (placeholder today) | `Hero`, `ChipRow`, `ListRow`, `Empty` |
| E1d | Earnings detail for one recipe (remix X14) | `earn/[ref]` | `ListRow` |
| E2 | How earning works (shared sheet, remix X15) | sheet on E1 | `ListRow` |
| C1 | Create tab with recipes | `(tabs)/create.tsx` (existing) | new `FestivalCard`, `RecipeRail` (from `song-rail.tsx`) |
| C2 | Recipes gallery | `recipes/index` (new) | `ChipRow`, `RecipeRail`, `ListRow` |
| C3 | Collection | `recipes/c/[slug]` (new) | 2-column `RecipeTile` grid |
| C4 | Recipe page (user) | `recipes/[publicId]` (new) | `ReelVideo`, `Card`, `Button` |
| C5 | Create with a recipe | `(tabs)/create.tsx?recipe=` | existing Create + new `RecipeCard` |
| C6 | Making | `making/[id]` (existing) | one extra line |
| C7 | Reel ready, from a recipe | `reel/[id]` (existing) | `Header sub`, caption card |
| W1 | Public recipe page | web `/r/[publicId]` (new) | `/s/[publicId]` shell, Report dialog, login |

### M1. "Share as a recipe" card (finished reel)

On `reel/[id]`, after the **Post it** card and before **Caption**. Shown when the film is `completed`, has no `songId` (not a music video), and wasn't made from a recipe.

| State | Card | Action |
|---|---|---|
| Not shared | Recipe icon in `teal-tint` · **"Share as a recipe"** · "Others make their own reel with this look, script shape and music. You earn credits each time." | **Share as a recipe** (secondary; the screen's primary stays **Share**) |
| Shared | `Status` ok "Shared as a recipe" · "38 reels made · 21 credits earned" · link `reelkar.app/r/d7Qm2Kp9xa` | **Share link** (secondary) · **See recipe** (ghost) |
| Taken down | `Status` error "Removed after a report" · "It isn't shared any more. Reason: Copyright." | **Ask for a review** (grievance form) |
| Made from a recipe | Row "Recipe by @meera.makes" → C4 | none (can't re-share someone's recipe in v1) |

### M3. Share as a recipe sheet

`Header` in sheet: **Share as a recipe**. While the shape is drafted (≈3 s): skeleton rows; the primary is disabled with the label "Reading your reel…".

1. **Preview row:** poster 54×96 (9:16, `radius-sm`), recipe name, "Story · 3D cartoon · 30 s".
2. **What people get** (`Card`, check icons in `teal-text`): Look: 3D cartoon · Script shape: Hook → 4 beats → Payoff (tap **See the shape** to expand the numbered list with each intent) · Music: this reel's background track · Length: 30 s · Quality: AI animation (they can change it).
3. **What stays private** (`Card flat`, lock icons): Your idea and words · Your photo and characters · Your brand look and handle.
4. **Name** `Field` (prefilled from the reel title, editable, 40 characters, counter), helper "People see this name. Keep it about the idea, not you."
5. **Good for** `ChipRow` (multi, optional, max 2): festival chips for the next 60 days first (e.g. Diwali · Eid Al Etihad · Christmas), then **Any day**, then **More** (opens the full list). Selected = `deep` fill + check, never colour alone.
6. **Preview** `Switch` **Show my reel as the preview**. On by default when no real person is in it. When a photo, saved character or the maker's own video was used: off by default, with the caption "It shows the people in your reel. Turn on only if they agreed to it being public." Off = the look card.
7. Info `Banner` (`teal-tint`): "Your recipe shows **Made with AI** and your @name. Anyone with the link can see it. You earn **10% of the paid credits** people spend on it. Stop sharing any time."
8. Footer primary **Share recipe**. Free.

On tap: the server re-runs the existing text safety checks on the name and the shape (fail closed, like Listen publish).
- Fail: `Banner kind="error"` "We can't share this name: it names a real artist. Change it and try again."
- Check unavailable: "We couldn't check your recipe right now, so it wasn't shared. Try again in a minute."
- Offline: "You're offline. Connect and try again." (fields kept).

### M4. Recipe is live

`Win` "Your recipe is live"; poster; "People can find it in Recipes{ and in Diwali}." Buttons: **Share link** (primary, native share sheet; message "Make your own Diwali reel with my recipe: reelkar.app/r/d7Qm2Kp9xa") · **See it** (secondary → M5) · **Done** (ghost).

### M5. Recipe page, maker view

C4 layout with an owner card in place of the price card: "38 reels made · 21.4 credits earned · 3 this week", buttons **Edit name and festival** · **Stop sharing** (confirm: title "Stop sharing this recipe?", text "It leaves Recipes and its link stops working. Reels people already made stay theirs." · **Cancel** · **Stop sharing** destructive). Stopped: same card with **Share again**. No "Use this recipe" for your own recipe (you'd earn nothing; **Make another like it** opens C5 with the label "Your recipe · you don't earn from your own uses").

### E1. Earnings (shared screen, Recipes chip)

One screen for everything a creator earns, specified once in `remix-spec.md` X13 (route `earn.tsx`; the Earn placeholder in Account becomes this screen; also opened from Credits and Inbox). Recipes add rows and a chip, nothing else:
1. `Header` "Earnings". **Hero** (saffron): overline "You've earned", big number **"21.4 credits"** (one decimal, rounded down), sub "21 added to your balance · 0.4 on the way". Total across remixes and recipes.
2. `ChipRow` **All · Remixes · Recipes** (single). Recipes shows only recipe rows; All mixes both, highest first.
3. Rows (one per recipe or song): 9:16 thumb 40×71 for a recipe (square cover for a song), title, "38 uses · 12 free" or "18 remixes", amount "+21.4", `Status` for a stopped or removed recipe (icon + word). Tap → E1d.
4. Card **How earning works** → E2. Caption: "Earned credits work like any credits. They can't be cashed out yet."
5. The old "Free guides / Courses / Brand deals" list moves below as "Coming after the beta".
States (shared): loading skeleton · empty ("Nothing earned yet. When people remix your public songs or use your recipes, it shows here." + **Share a song on Listen**; on the Recipes chip the button is **Open my reels**) · offline: last saved totals, "Updated 2 h ago" · error + retry.

**E1d. Earnings detail** (remix X14), for a recipe: newest first, "Someone made a reel · 2 Nov · +6.3"; uses paid with free credits read "Free credits, nothing earned" in `ink-muted`. People stay anonymous ("Someone"): makers never learn who used a recipe (a reel isn't public the way a published remix is). "Load more" at 50.

### E2. How earning works (shared sheet, remix X15)

The same six lines for remixes and recipes:
1. "When someone remixes your public song, or makes a reel with your recipe, you get 10% of the credits they paid for."
2. "Free credits, like your welcome credits, don't count."
3. "You earn when their remix or reel is made. If it fails, they get their credits back and nothing is earned."
4. "You never earn from your own songs or recipes."
5. "Small amounts add up: every 1.0 goes into your balance."
6. "Earned credits can't be cashed out yet."

### C1. Create tab with recipes

After the existing **Hum it** card and before "What do you want to make?":
- **FestivalCard** (the one `hero` on Create while a festival is near, 3 weeks before to 2 days after): overline "Diwali · in 2 days", title "Diwali reels, ready to make", three 9:16 thumbs, **See Diwali recipes** (`deep` button on the hero). Outside festival windows the card isn't shown.
- **Start from a recipe** rail: 6 `RecipeTile`s (trending this week, mixed formats, skipping own), trailing **See all** tile → C2.
Create's primary stays **Make my reel**.

### C2. Recipes gallery

`Header title="Recipes" back right={<Credits/>}`.
1. Festival hero (current or next festival) → C3.
2. Format chips (single): **All · Story · Motion · Kids dance · Edit my video**.
3. Rails: **Trending this week** (completed uses by others in 7 days), **New**, **Free to make** (standard quality, motion and dance: uses the free weekly reels), **For kids** (`kidSafe`).
4. **Festivals** grid (2 columns, `surface-raised` tiles with the festival's native name in its script and its date): upcoming first. Collections in v1: Diwali, Eid (Eid al-Fitr and Eid al-Adha), Ramadan, Holi, Raksha Bandhan, Onam, Eid Al Etihad (UAE National Day, 2 December), Saudi National Day, Ganesh Chaturthi, Navratri and Durga Puja, Pongal, Christmas, New Year, plus the all-year **Birthday · Wedding · Shop and business · Motivation**.
States: skeleton rails; offline banner "You're offline. Showing recipes from earlier."; error with **Try again**; a collection with no recipes: `Empty` "No Holi recipes yet" / "Make a Holi reel and share it as a recipe. You'd be the first." + **Make a reel**.

### C3. Collection

`Header title="Diwali"` sub "8 November · 46 recipes". Featured row (up to 3 the owner picks, "Picked by Reelkar" pill) then a 2-column grid of `RecipeTile`s by uses in 7 days, max 2 per maker in the first 12. Format chips as in C2.

### C4. Recipe page (app)

`Header` back, right: **Share** and ⋯ (Report).
1. **Preview** 9:16 (`ReelVideo`, 62% width, poster first; plays on tap, muted by default with a sound toggle; never autoplays on cellular). Timeline bar under it follows the video (left to right in every language).
2. Title (`title-lg`), "by @meera.makes" (tappable → their other recipes), chips "Story · 3D cartoon · 30 s", **Made with AI** pill, "For kids" pill when `kidSafe`, festival pill.
3. Stats "1.2K reels made" (compact numbers by locale).
4. **You bring** (`Card`): Your topic · Your photo (optional) · Your language. **The recipe has**: Look · Script shape (Hook → 4 beats → Payoff, expandable) · Music · Length.
5. **Price card**: "AI animation · 72 credits" with the alternative "Or Standard · free (2 left this week)"; one line "@meera.makes earns from this at no cost to you." (exact line from the Earnings table once signed in).
6. Footer primary **Use this recipe** → C5.
7. **More for Diwali** rail, **By @meera.makes** rail.
8. Footer link **Report this recipe**.
States: loading skeleton · error banner + Try again · stopped sharing ("This recipe isn't shared any more" + **Back to recipes**) · taken down ("This recipe was removed after a report.") · not found · preview fails ("The preview didn't load. Tap to try again."; the rest stays usable).

### C5. Create with a recipe

The existing Create screen, opened with `?recipe={publicId}`:
- **RecipeCard** at the top (replaces the kind chips, look chips and length chips, which the recipe locks): 9:16 thumb, "Recipe: Diya Night", "by @meera.makes", locked rows with lock icons: Story · 3D cartoon · 30 s · Same music. Link **Make it without the recipe** (ghost; keeps the values and unlocks everything, and the maker earns nothing; confirm not needed, undo by tapping the recipe again).
- **Topic** `Field`, label "What's your reel about?", placeholder from the recipe (`spec.topicHint`, written by the AI at publish, e.g. "A Diwali memory, your shop, your family…"), the existing "Give me ideas" button (ideas fit the recipe's format).
- **Star in it (optional)**: photo picker with the existing consent chips, shown only when the chosen quality uses a photo.
- **Voice and captions** language chips (preselected from the user's app language; caption "The recipe works in any language").
- **Quality** chips (story only): the recipe's quality first, marked "Recipe uses this".
- **Earnings line** (caption under the button, `ink-muted`): see Earnings › What the user sees.
- Footer primary: **Make my reel · 72 credits** (existing label rules; standard reels say **Make my reel** with "Uses 1 of your 2 free reels this week").
Errors: topic under 20 characters (existing message); not enough credits (existing banner + **Get credits**); recipe gone (`Banner kind="warn"` "This recipe isn't shared any more. You can still make this reel without it." + **Make it without the recipe**); offline ("You're offline. Your topic is kept.").

### C6. Making

Unchanged stages. Header sub adds "Recipe by @meera.makes". The script stage label reads "Hook and script, following the recipe".

### C7. Reel ready, from a recipe

`Header sub` "Ready · Story · Made with AI · Recipe by @meera.makes". The Caption card adds a chip **Credit @meera.makes** (on by default) which appends "Recipe by @meera.makes on Reelkar" to the caption; the user can switch it off. The M1 card shows the "Made from a recipe" row instead of "Share as a recipe".

---

## Web

### W1. Public recipe page `reelkar.app/r/{publicId}` (no sign-in)

Same shell, performance budget and no-JS fallback as `/g/` and `/s/`: first load < 150 KB excluding the video, text first, the poster as a dominant-colour block until loaded, video `preload="none"` (plays on tap; on desktop muted autoplay of the 15 s preview is allowed when `prefers-reduced-motion` is off and the connection isn't `saveData`). Language from the browser (en, hi, ar; Arabic sets `dir="rtl"`).

Layout: phone width one column; desktop (from `bp-desktop`) two columns: left the 9:16 preview (max 360 px wide, sticky), right the details.
- Top bar: reel mark + "Reelkar" · **Get the app**.
- **Hero** (`hero` gradient, one per page): overline "A reel recipe" (+ festival), title, "by @meera.makes", chips, **Made with AI** pill.
- Stats "1.2K reels made with it".
- **You bring / The recipe has** (as C4).
- **Price**: "Free with Standard (3 free reels a week), or 72 credits with AI animation". Signed out we don't know their credits, so the line is general: "Makers earn 10% of the credits people spend on their recipes."
- Primary **Use this recipe** (`deep` on the hero; sticky `action` button at the bottom on phones). Signed out → the existing login (`/login?next=/create?recipe={publicId}`); new accounts get the 20 welcome credits. With the app installed, a universal link opens C5.
- **More recipes for Diwali** (6, links to other `/r/` pages).
- Footer: "Made with AI on Reelkar" · **Report** · Terms · Privacy.

Link preview: `og:image` 1200×630 (left the poster frame cropped 630×630, right the `hero` panel: "A Diwali reel recipe", the name in Bricolage, "by @meera.makes", "Made with AI" pill; Arabic flips), `og:title` "Diya Night: a reel recipe by @meera.makes", `og:description` "Make your own version on Reelkar. Made with AI.", `og:type` `website`.

States: Stopped sharing ("This recipe isn't shared any more. The maker stopped sharing it." + **See more recipes**), Taken down ("This recipe was removed after a report."), Not found (404, same layout), Preview fails (inline banner, rest usable), Slow network (poster only, "Tap to play" + size "1 MB").

No web gallery in v1 (like Listen decision 11): only recipe pages are public; **See more recipes** goes to the signed-in web Create.

## Report (every public recipe)

Reuse the shared Report sheet and reasons exactly (`voice_or_likeness`, `copyright`, `hateful`, `minor_sexual`, `other`), optional details (500) and email, "Thanks. We'll review it within 24 hours." and the grievance officer link. Where: C4 ⋯ and footer, every tile's long-press menu, W1 footer. A report never hides a recipe by itself (Listen owner decision 7); a person reviews it and sets `taken_down_at`. In the app, a reported recipe is hidden for the reporter.

---

## Earnings

### The rule (shared with remix chains)

Earnings follow the one model in `remix-spec.md` › "Earnings (shared with recipes)"; recipes are `source = recipe`. When a reel made from a recipe **finishes** (`film.status` becomes `completed`) and its maker isn't the user:

```
paidIn   = Σ ledger.delta where delta > 0 and reason in (purchase, subscription)   -- the payer, all time
freeIn   = Σ ledger.delta where delta > 0 and reason in (grant, earning)
ratio    = paidIn / (paidIn + freeIn)      (0 when both are 0; refunds left out of both)   -- paidRatio(userId)
hundredths = floor(charged × paid_ratio_bp × rate_bp / 1_000_000)                          -- rate_bp 1000 = 10% (placeholder)
```

Amounts are kept in **hundredths of a credit** (integers). The ratio is taken **when the reel is charged** and saved on the `creator_earning` row (`paid_ratio_bp`), so later purchases don't change it; the rate is saved too (`rate_bp`), so a later change of the share applies only to new rows.

Why proportional and not a "paid balance": the ledger already tells paid credits from free ones by reason; a ratio needs one sum query and no new balance column, no migration that splits existing balances, and no policy for which credits get spent first (a policy that would either work against the spender or against the maker). It is easy to explain: "if a third of your credits were free, a third of your spend doesn't count".

Examples (the user bought 150 and got 20 welcome credits, `paid_ratio_bp` 8823):
| Reel | Credits charged | Maker earns (hundredths → credits) |
|---|---|---|
| Story, AI animation, 30 s (6 shots × 12) | 72 | 635 → 6.35 |
| Story, Cinematic (Kling), 30 s (6 × 30) | 180 | 1588 → 15.88 |
| Kids dance, AI song | 1 | 8 → 0.08 |
| Any free weekly Standard reel | 0 | 0 (no row) |
| A user who only has welcome credits | 72 | 0 ("Free credits, nothing earned") |

### Paying it

- `startFilm` inserts a `creator_earning` row (`source = recipe`, `source_ref` = film id, `subject_ref` = recipe id, `payer_user_id`, `charged`, `paid_ratio_bp`, `rate_bp`, `hundredths`, `status = pending`) when the maker isn't the payer and the reel cost credits.
- On completion the shared `settleEarning()` (in `src/lib/billing/credits.ts`, used by remixes too) marks it `earned` and, in one transaction, adds to `credit_balance.earned_hundredths`; `whole = floor(earned_hundredths / 100) − earned_credited`; if `whole > 0`, `grantCredits(maker, whole, "earning", "earning:{creatorEarningId}")` and `earned_credited += whole`. The `(reason, ref)` unique index makes it idempotent.
- One `ledger_reason` value **`earning`** for both features. Earned credits count as **free** in the ratio, so spending them never earns again (no loops).
- **Failed reels:** the existing refund runs; the row becomes `dropped`; nothing earned. **Edit reels waiting for review** settle when they finish rendering. **Recipe taken down** (report upheld) while a reel is making: its pending rows are `dropped`; if it was only stopped by the maker, they settle.
- **Never clawed back:** a granted earning stays, even if support later refunds the payer or the recipe is removed.
- **Margin check:** Reelkar keeps ~30% margin on paid credits (catalog notes). The maker's 10% is paid in credits, which cost Reelkar at most ~70% of their face value when spent, so the worst case is ~7% of the spend: margin stays positive on every reel.

### Anti-abuse (only what's needed)

- **Own uses never earn**, and don't count in "reels made".
- **Only finished reels, only paid credits, one earning per film.** Since earnings come from real money and are 10% of it, using your own recipe from a second account always costs more than it earns; no caps are needed.
- **Not doing:** daily caps, holds, KYC, ranking penalties, clawbacks. Revisit only if chargebacks appear (the loss is bounded by 10%).

### What the user sees

| Where | When | Copy |
|---|---|---|
| C5 under the button | maker earns ≥ 1 credit | "@meera.makes earns 6 credits from this. It costs you the same." |
| | 0 < earning < 1 | "@meera.makes earns a small share. It costs you the same." |
| | free reel, or only free credits | "@meera.makes will see that their recipe was used." |
| | own recipe | "Your recipe · you don't earn from your own uses." |
| C4 / W1 | always | "Makers earn 10% of the paid credits people spend on their recipes." |
| Maker push | first use of a recipe | "Someone made a reel with Diya Night" / "You earned 6.3 credits." |
| | daily digest, max 1 a day per recipe (same push kind as remixes, "Remixes and earnings") | "Diya Night was used 9 times" / "You earned 14.2 credits." |
| Earnings | always | amounts with one decimal, rounded down from hundredths |

On C5 the number is rounded **down** to whole credits; on Earnings to one decimal. Neither ever overstates what the maker gets.

---

## Festival collections

- **Source:** a small constant file `src/lib/festivals.ts` (slug, names in en/hi/ar, date range per year, region `in · gcc · all`, featured recipe ids). The owner edits it each year; lunar dates (Eid, Ramadan, Diwali, Holi) change every year. No admin screen in v1.
- **Window:** a festival shows on Create and Home from 21 days before its first day to 2 days after its last; the gallery lists it all year under "Coming up" with its date.
- **Region:** by the user's app language and time zone: `Asia/Dubai` or Arabic puts Gulf festivals first (Eid Al Etihad, Saudi National Day, Ramadan, Eid), Indian time zones put Indian festivals first; everyone sees all.
- **Tagging:** makers tag up to 2 occasions on M3; the owner can add or remove a recipe from a collection and pick up to 3 featured ones.
- **2026–27 order (dates from the table; check before each season):** Diwali (8 Nov 2026) · Eid Al Etihad, UAE (2 Dec) · Christmas · New Year · Ramadan and Eid al-Fitr (Feb–Mar 2027) · Holi (Mar) · Eid al-Adha (May) · Raksha Bandhan (Aug) · Onam (Aug–Sep) · Ganesh Chaturthi · Saudi National Day (23 Sep) · Navratri and Durga Puja.

---

## Copy (English · Hindi · Arabic)

ICU message format. Handles, names and URLs in bidi isolates (`<bdi>` on web, `⁨…⁩` in RN). Arabic plurals need zero/one/two/few/many/other; shown here in their common form.

| Key | English | Hindi | Arabic |
|---|---|---|---|
| `recipe.name` | Recipe | रेसिपी | وصفة |
| `recipe.share.card` | Share as a recipe | रेसिपी के रूप में शेयर करें | شاركها كوصفة |
| `recipe.share.cardText` | Others make their own reel with this look, script shape and music. You earn credits each time. | दूसरे इसी लुक, स्क्रिप्ट के ढाँचे और म्यूज़िक से अपनी रील बनाएँ। हर बार आपको क्रेडिट मिलेंगे। | يصنع الآخرون ريلهم بنفس الشكل وهيكل النص والموسيقى، وتكسب رصيدًا في كل مرة. |
| `recipe.sheet.title` | Share as a recipe | रेसिपी शेयर करें | مشاركة كوصفة |
| `recipe.sheet.reading` | Reading your reel… | आपकी रील पढ़ी जा रही है… | جارٍ قراءة الريل… |
| `recipe.get` | What people get | लोगों को क्या मिलेगा | ما يحصل عليه الآخرون |
| `recipe.private` | What stays private | क्या निजी रहेगा | ما يبقى خاصًا |
| `recipe.private.words` | Your idea and words | आपका आइडिया और शब्द | فكرتك وكلماتك |
| `recipe.private.photo` | Your photo and characters | आपकी फ़ोटो और किरदार | صورتك وشخصياتك |
| `recipe.private.brand` | Your brand look and handle | आपका ब्रांड लुक और हैंडल | هوية علامتك واسم حسابك |
| `recipe.look` | Look | लुक | الشكل |
| `recipe.shape` | Script shape | स्क्रिप्ट का ढाँचा | هيكل النص |
| `recipe.shape.value` | Hook → {n} beats → Payoff | हुक → {n} हिस्से → अंत | افتتاحية ← {n} مشاهد ← خاتمة |
| `recipe.music` | Music: this reel's track | म्यूज़िक: इसी रील की धुन | الموسيقى: لحن هذا الريل |
| `recipe.length` | Length | लंबाई | المدة |
| `recipe.nameField` | Recipe name | रेसिपी का नाम | اسم الوصفة |
| `recipe.nameHelp` | People see this name. Keep it about the idea, not you. | यह नाम सबको दिखेगा। इसे आइडिया के बारे में रखें, अपने बारे में नहीं। | سيظهر هذا الاسم للجميع. اجعله عن الفكرة لا عنك. |
| `recipe.goodFor` | Good for | किस मौक़े के लिए | مناسبة لـ |
| `recipe.anyDay` | Any day | कभी भी | أي يوم |
| `recipe.preview` | Show my reel as the preview | मेरी रील को प्रीव्यू में दिखाएँ | عرض الريل كمعاينة |
| `recipe.preview.people` | It shows the people in your reel. Turn on only if they agreed to it being public. | इसमें आपकी रील के लोग दिखते हैं। तभी चालू करें जब वे सार्वजनिक होने के लिए राज़ी हों। | يظهر فيه الأشخاص في الريل. فعّله فقط إذا وافقوا على نشره للعامة. |
| `recipe.publicNote` | Your recipe shows Made with AI and your @name. Anyone with the link can see it. You earn 10% of the paid credits people spend on it. Stop sharing any time. | आपकी रेसिपी पर "AI से बना" और आपका @नाम दिखेगा। लिंक वाला कोई भी इसे देख सकता है। लोग इस पर जो ख़रीदे हुए क्रेडिट खर्च करेंगे, उसका 10% आपको मिलेगा। आप कभी भी शेयर करना बंद कर सकते हैं। | تظهر على وصفتك عبارة «صُنع بالذكاء الاصطناعي» واسمك @. يمكن لأي شخص لديه الرابط رؤيتها. تكسب 10% من الرصيد المدفوع الذي يُنفق عليها. يمكنك إيقاف المشاركة في أي وقت. |
| `recipe.shareBtn` | Share recipe | रेसिपी शेयर करें | مشاركة الوصفة |
| `recipe.live` | Your recipe is live | आपकी रेसिपी लाइव है | وصفتك متاحة الآن |
| `recipe.shareLink` | Share link | लिंक शेयर करें | مشاركة الرابط |
| `recipe.shareMsg` | Make your own {occasion} reel with my recipe: {url} | मेरी रेसिपी से अपनी {occasion} रील बनाओ: {url} | اصنع ريل {occasion} الخاص بك بوصفتي: {url} |
| `recipe.use` | Use this recipe | यह रेसिपी इस्तेमाल करें | استخدام هذه الوصفة |
| `recipe.by` | by {handle} | {handle} की रेसिपी | من {handle} |
| `recipe.made` | {n, plural, one {# reel made} other {# reels made}} | {n} रीलें बनीं | {n} ريل صُنع بها |
| `recipe.youBring` | You bring | आप लाएँ | ما تضيفه أنت |
| `recipe.bring.topic` | Your topic | आपका विषय | موضوعك |
| `recipe.bring.photo` | Your photo (optional) | आपकी फ़ोटो (चाहें तो) | صورتك (اختياري) |
| `recipe.bring.video` | Your video | आपका वीडियो | الفيديو الخاص بك |
| `recipe.bring.lang` | Your language | आपकी भाषा | لغتك |
| `recipe.has` | The recipe has | रेसिपी में है | ما في الوصفة |
| `recipe.anyLang` | The recipe works in any language | यह रेसिपी हर भाषा में चलती है | تعمل الوصفة بأي لغة |
| `recipe.topicLabel` | What's your reel about? | आपकी रील किस बारे में है? | عمّ يتحدث الريل؟ |
| `recipe.without` | Make it without the recipe | रेसिपी के बिना बनाएँ | الإنشاء بدون الوصفة |
| `recipe.earns.n` | {handle} earns {n} credits from this. It costs you the same. | इससे {handle} को {n} क्रेडिट मिलेंगे। आपके लिए दाम वही है। | يكسب {handle} ‏{n} رصيد من هذا، والسعر عليك كما هو. |
| `recipe.earns.small` | {handle} earns a small share. It costs you the same. | {handle} को छोटा हिस्सा मिलेगा। आपके लिए दाम वही है। | يكسب {handle} حصة صغيرة، والسعر عليك كما هو. |
| `recipe.earns.free` | {handle} will see that their recipe was used. | {handle} को दिखेगा कि उनकी रेसिपी इस्तेमाल हुई। | سيعرف {handle} أن وصفته استُخدمت. |
| `recipe.earns.own` | Your recipe · you don't earn from your own uses. | आपकी रेसिपी · अपने इस्तेमाल से कमाई नहीं होती। | وصفتك · لا تكسب من استخدامك لها. |
| `recipe.earns.general` | Makers earn 10% of the paid credits people spend on their recipes. | लोग किसी रेसिपी पर जो ख़रीदे हुए क्रेडिट खर्च करते हैं, उसका 10% बनाने वाले को मिलता है। | يكسب صانع الوصفة 10% من الرصيد المدفوع الذي يُنفق عليها. |
| `recipe.credit` | Credit {handle} | {handle} को क्रेडिट दें | ذكر {handle} |
| `recipe.creditLine` | Recipe by {handle} on Reelkar | Reelkar पर {handle} की रेसिपी | وصفة من {handle} على Reelkar |
| `recipe.gone` | This recipe isn't shared any more. You can still make this reel without it. | यह रेसिपी अब शेयर नहीं है। आप इसके बिना भी यह रील बना सकते हैं। | لم تعد هذه الوصفة متاحة. ما زال بإمكانك إنشاء الريل بدونها. |
| `recipe.removed` | This recipe was removed after a report. | शिकायत के बाद यह रेसिपी हटा दी गई। | أُزيلت هذه الوصفة بعد بلاغ. |
| `recipe.stop` | Stop sharing | शेयर करना बंद करें | إيقاف المشاركة |
| `recipe.stop.confirm` | It leaves Recipes and its link stops working. Reels people already made stay theirs. | यह रेसिपी से हट जाएगी और लिंक काम नहीं करेगा। लोगों की बनाई रीलें उन्हीं की रहेंगी। | ستُزال من الوصفات ويتوقف رابطها. تبقى الريلات التي صنعها الآخرون ملكًا لهم. |
| `recipe.report` | Report this recipe | इस रेसिपी की शिकायत करें | الإبلاغ عن هذه الوصفة |
| `recipe.ai` | Made with AI | AI से बना | صُنع بالذكاء الاصطناعي |
| `gallery.title` | Recipes | रेसिपी | الوصفات |
| `gallery.start` | Start from a recipe | किसी रेसिपी से शुरू करें | ابدأ من وصفة |
| `gallery.trending` | Trending this week | इस हफ़्ते ट्रेंडिंग | الأكثر رواجًا هذا الأسبوع |
| `gallery.free` | Free to make | बनाना मुफ़्त | مجانية الإنشاء |
| `gallery.festivals` | Festivals | त्योहार | المناسبات |
| `gallery.inDays` | {festival} · in {n} days | {festival} · {n} दिन में | {festival} · بعد {n} أيام |
| `gallery.festivalTitle` | {festival} reels, ready to make | {festival} की रीलें, बनाने के लिए तैयार | ريلات {festival} جاهزة للإنشاء |
| `gallery.empty` | No {festival} recipes yet. Make a {festival} reel and share it as a recipe. You'd be the first. | अभी {festival} की कोई रेसिपी नहीं। {festival} की रील बनाकर रेसिपी शेयर करें, आप पहले होंगे। | لا توجد وصفات {festival} بعد. اصنع ريلًا وشاركه كوصفة، وكن الأول. |
| `earn.title` | Earnings | कमाई | الأرباح |
| `earn.chip.recipes` | Recipes | रेसिपी | الوصفات |
| `earn.uses` | {n, plural, one {# use} other {# uses}} · {free} free | {n} बार इस्तेमाल · {free} मुफ़्त | {n} استخدام · {free} مجاني |
| `earn.someone` | Someone made a reel | किसी ने रील बनाई | صنع شخص ريلًا |
| `earn.empty.recipes` | Share a finished reel as a recipe. You earn credits when people make reels with it. | कोई पूरी बनी रील रेसिपी के रूप में शेयर करें। लोग उससे रील बनाएँ तो आपको क्रेडिट मिलेंगे। | شارك ريلًا مكتملًا كوصفة، وتكسب رصيدًا عندما يصنع الناس ريلات بها. |
| (shared) | `earn.hero`, `earn.how`, `earn.how.1`–`6`, `earn.empty`, "on the way": see `remix-spec.md` › Copy | | |
| `push.recipe.first` | Someone made a reel with {recipe} | किसी ने {recipe} से रील बनाई | صنع شخص ريلًا بوصفة {recipe} |
| `push.recipe.day` | {recipe} was used {n} times | {recipe} {n} बार इस्तेमाल हुई | استُخدمت {recipe} ‏{n} مرات |
| `festival.diwali` | Diwali | दिवाली | ديوالي |
| `festival.eid` | Eid | ईद | العيد |
| `festival.ramadan` | Ramadan | रमज़ान | رمضان |
| `festival.holi` | Holi | होली | هولي |
| `festival.rakhi` | Raksha Bandhan | रक्षाबंधन | راخي |
| `festival.onam` | Onam | ओणम | أونام |
| `festival.uae` | UAE National Day | यूएई राष्ट्रीय दिवस | عيد الاتحاد |
| `festival.ksa` | Saudi National Day | सऊदी राष्ट्रीय दिवस | اليوم الوطني السعودي |
| `festival.christmas` | Christmas | क्रिसमस | عيد الميلاد |

### Language rules

All of `design/community/flow-spec.md` › Language rules apply. In addition:
- **Hindi and Indic:** recipe names come from the maker in any script, shown as written with `dir="auto"` and `lang` from the recipe's language hint. Tiles wrap names to 2 lines (Tamil and Telugu names run long); the C5 locked rows wrap, never truncate. Festival tiles show the native name large and the English name small.
- **Arabic (RTL):**
  - **Mirror:** rails (start on the right, scroll leftwards), the 2-column grid order, list rows, chips, back chevrons, the RecipeCard (thumb on the right), the og card (poster on the right), the "→" in "Hook → 4 beats → Payoff" (written with "←" in Arabic, as in the table).
  - **Don't mirror:** the 9:16 video, its play button and timeline bar, timecodes, durations ("30 s" stays a number + unit), @handles, URLs, the reel mark.
  - **Gender:** buttons use verbal nouns ("استخدام هذه الوصفة", "مشاركة الوصفة"), as in gifts. "سيعرف {handle} أن وصفته استُخدمت" uses the masculine as the generic; when we later know nothing better this is acceptable Gulf usage.
  - **Numbers:** digits follow the phone (Western by default); "10%" stays Western in both.

## Components and tokens

| Component | Spec |
|---|---|
| `RecipeTile` | 9:16 poster 120×213 (rail) or ½ column (grid), `radius-md`; bottom gradient `rgba(26,11,32,.0→.78)` over the poster's lower 40% for legibility; name `label` white 2 lines; "@handle" `caption`; format badge top-start (`pop`/`on-pop`, 24 tall, icon + word); "Free" badge `teal`/`on-teal` when standard; uses count `caption` |
| `FestivalCard` | `Hero` (`hero-start→hero-end`, `hero-ring`), `on-brand` text, 3 overlapping 9:16 thumbs (56×100, `radius-sm`, 2 px `hero-ring` border), button `deep`/`on-deep` |
| `RecipeCard` (C5) | `Card` with `teal-tint` header strip "Recipe"; thumb 48×85; locked rows `ListRow` 44 min with lock icon `ink-muted` + value `label`; link ghost button 44 |
| `ShapeList` | numbered list; number badge 28 `deep`/`on-deep` (hook) or `surface-sunken`/`ink`; role `label`, intent `caption` |
| `KeepsList` | rows 44 with check (`teal-text`) or lock (`ink-muted`) icon + text; never colour alone |
| `ShareAsRecipeCard` | as Listen's `ShareOnListenCard`: icon 40 in `teal-tint`, `Status` for Shared / Removed |
| `EarningsHero` | `Hero`; number `display-xl` with tabular digits; sub `on-brand-muted`; button `deep` |
| `PriceRow` | `surface-sunken` `radius-md`, `space-4`; price `label`; earnings line `caption` `ink-muted` |

Performance: posters are 240×427 JPEG (~18 KB) in rails, never video; previews load only on the recipe page and only on tap (or muted autoplay on desktop Wi-Fi); no blur; one sheet at a time with `elevation-2`.

## Accessibility

- Targets 44 pt minimum (`tap-min` 48 for primaries); tiles are one button each (whole tile).
- Contrast: tile text sits on a 78% plum gradient (white 9:1+ over any poster); `on-brand` on hero 6.5:1; buttons on the hero are `deep`; chilli `action` only on `surface`/`surface-raised`.
- Screen readers: a tile reads "Diya Night, a story reel recipe by @meera.makes, 30 seconds, 1.2 thousand reels made. Free." The lock icons in C5 read "Locked by the recipe: 3D cartoon". The earnings hero reads "21.4 credits earned from recipes; 21 added to your balance".
- Never colour alone: Free/format badges have words; locked rows have a lock icon and the word "Recipe" in the header; status uses icon + word.
- Font scale to 200%: rails show 1.5 tiles; tile names may take 3 lines (the poster grows taller below the image); C5 rows wrap.
- Reduce motion: no autoplay of previews anywhere, no rail snap animation, the "Recipe is live" `Win` without the confetti; the festival card thumbs don't fan.
- Video preview has a visible mute toggle and pauses when scrolled off-screen; captions are burned into reels already.

## Edge cases

- **Maker stops sharing while someone is in C5:** `POST /api/films` with the recipe returns 410; C5 shows the "isn't shared any more" banner with **Make it without the recipe** (values kept, nothing charged yet).
- **Maker deletes the source reel:** the recipe stays (it's a snapshot with its own preview and music copy). The delete confirm offers **Delete reel and recipe** · **Delete reel, keep recipe** · **Cancel**.
- **Maker deletes their account:** all their recipes stop working (pages show "isn't shared any more"); earnings stop; reels others made are untouched.
- **Maker's handle changes:** pages show the new handle; old links work (publicId).
- **User picks a lower quality than the recipe** (Cinematic → Standard): allowed and still the recipe (quality is the user's), the maker earns on what was spent; C5 notes "The recipe was made in Cinematic. Standard looks simpler."
- **Story recipe, user adds no photo:** fine; the AI draws the lead from the topic. **Edit recipe without a video:** primary stays disabled with "Choose your video first".
- **A recipe reel is shared as a recipe:** not in v1 (the M1 card shows "Recipe by @…" instead). Avoids copy-farming another maker's work.
- **Kids dance recipes** stay `kidSafe` and show "For kids"; the user can't turn it off without leaving the recipe.
- **A language the TTS can't speak:** the existing "Narration in X isn't available yet" error before charging.
- **Free weekly reels used up:** standard recipe reel costs 1 credit (existing rule); earnings follow the paid share of that 1 credit.
- **Shape writer returns names or numbers:** the safety pass strips or fails; the maker sees "Couldn't read this reel's script. Try again." and can retry; after 2 fails the card says "This reel can't be shared as a recipe yet."
- **Motion reel with a `comment` ending:** the recipe keeps the ending; the keyword is the user's own (from Create; if empty, ending falls back to `auto`).
- **Same user makes 30 reels from one recipe in a day:** allowed; all earn (it's their money).
- **Recipe from a premium reel when premium isn't available on the server:** C5 hides that quality and preselects Standard with the note above.
- **Very long names / handles:** tiles 2 lines with ellipsis; og image fits 2 lines, then ellipsis.

---

## Build notes

### Data (`src/lib/db/app-schema.ts`, then `npm run db:generate`; one migration)

- Shared with remix chains (one migration for whichever ships first): `ledger_reason` value **`earning`**; table **`creator_earning`** (`source` enum `remix | recipe`, hundredths, `paid_ratio_bp`, `rate_bp`, `status pending | earned | dropped`); `credit_balance.earned_hundredths` and `earned_credited`. Full columns in `remix-spec.md` › Data.
- `recipe`: `id` uuid, `publicId` text unique (10 chars, the gift token generator), `makerId` → user (cascade), `sourceFilmId` → film (set null), `format` (`film_format`), `name` text (≤ 40), `occasions` text[] (festival slugs, ≤ 2), `spec` jsonb (`recipeSpecSchema`, `v: 1`), `topicHint` text (≤ 80), `languageHint` text, `quality` (`film_quality`), `durationSec` int, `kidSafe` bool, `previewKind` (`reel | look`), `previewPath`, `posterPath`, `musicPath`, `publishedAt`, `unpublishedAt`, `takenDownAt`, `useCount` int (completed uses by others), `createdAt`. (Earned totals come from `creator_earning` by `subject_ref`.) Indexes: (`publishedAt`), (`format`), GIN on `occasions`, (`makerId`).
- `recipe_use`: `id`, `recipeId` → recipe (cascade), `userId` → user, `filmId` → film **unique**, `credits` int, `ownUse` bool, `earningId` → creator_earning (nullable), `status` (`started | completed | failed`), `createdAt`, `completedAt`. Index (`recipeId`, `completedAt`).
- `film.recipeId` uuid → recipe (set null).
- `recipe_report`: like `song_report` (reasons `giftReportReason`), `recipeId`.
- `src/lib/festivals.ts`: constant list (no table).
- Files: `OUTPUT_DIR/recipes/<id>/{preview.mp4, poster.jpg, music.m4a}` copied at publish.

### Endpoints (Next.js)

- `GET /api/films/[id]/recipe/draft` → `{ eligible, reason?, spec, shapeSummary, topicHint, needsPreviewConsent, suggestedName, festivals[] }` (free text AI writes the shape; cached per film).
- `POST /api/films/[id]/recipe` `{ name, occasions, preview: "reel" | "look" }` → safety checks (fail closed), file copies → `{ publicId, url }`. Needs a handle (`creator_profile`), else 409 `needsHandle` (the app opens M2).
- `PATCH /api/recipes/[publicId]` (name, occasions), `POST /api/recipes/[publicId]/unpublish`, `/publish`.
- `GET /api/recipes/home?lang=&tz=` → festival card, rails, collections (cached 60 s per lang and region). `GET /api/recipes?collection=&format=&list=trending|new|free|kids&cursor=`.
- `GET /api/recipes/public/[publicId]` → public view; when signed in also `{ price: { quality, credits, freeLeft }, makerEarns: { hundredths, kind: "n" | "small" | "free" | "own" } }`.
- `POST /api/recipes/public/[publicId]/report`.
- Earnings use the shared `GET /api/me/earnings?source=all|remix|recipe` and `GET /api/me/earnings/[subjectRef]` (remix spec); recipe rows add `freeUses` and stay anonymous.
- `POST /api/films` gains `recipe: publicId`. `parseFilmRequest` loads the recipe (410 if not shared, 404 unknown), overwrites the locked fields from `spec` and rejects a request that changes them; `startFilm` charges as today, takes `paidRatio()`, inserts `recipe_use` and the pending `creator_earning`, and sets `film.recipeId`. The job gets `recipe: { shape | slidePlan | dancePlan | editPreset, musicPath }`.
- Pipelines: `buildScriptPrompt` gets optional `shape`; motion's script writer gets the slide types in order and the theme; dance gets scene, bpm, dancers' looks, moves; edit gets the preset and the effect mix as a soft target for `buildEditPrompt`. Music: the recipe's track replaces `deps.music.compose` when present.
- Worker: on completion (`src/worker.ts`, where the film is marked completed) mark `recipe_use.completed`, `recipe.useCount++` when not own, and call the shared `settleEarning(earningId)`; on failure mark `failed` and the earning `dropped`, next to the existing refund.
- Push (existing Expo push, the remix spec's "Remixes and earnings" kind): events `recipe.firstUse`, `recipe.daily` (at most one a day per recipe).
- Web: `src/app/r/[publicId]/{page.tsx, recipe-page.tsx, copy.ts, recipe.module.css, opengraph-image.tsx}` copied from `src/app/s/[publicId]`; web Create reads `?recipe=`.
- Ask Reelkar and the MCP connector use `startFilm`, so they accept `recipe` for free; a `list_recipes` tool can come later.

### What each screen needs

| Screen | Data |
|---|---|
| M1 | film (status, format, songId, recipeId), my recipe for this film (publicId, status, useCount, earned) |
| M3 | draft (spec summary, shape list, topicHint, needsPreviewConsent, suggestedName), upcoming festivals, handle |
| M5 / C4 | public recipe (name, handle, format, style, durationSec, quality, kidSafe, occasions, poster, preview url signed per request, useCount, shape summary), my price + makerEarns, rails (same festival, same maker) |
| E1 / E1d / E2 | shared `/api/me/earnings` (totals in hundredths, on the way, by subject, `rateBp`) and its detail route |
| C1 / C2 / C3 | recipes home (festival, rails, collections), list pages |
| C5 | public recipe + spec locks, my balance, free reels left, makerEarns for the chosen quality (recomputed client-side when quality changes: `floor(credits × paidRatioBp × rateBp / 1_000_000)` hundredths, shown as whole credits; the API sends `paidRatioBp` and `rateBp`) |
| C6 / C7 | film.recipeId → recipe name + handle |
| W1 | public recipe (as C4) without price personalisation, og data |

### Reuse

- `reel/[id].tsx`: add `ShareAsRecipeCard`; Caption card gets the credit chip; header sub.
- Listen's handle picker (P1) and publish sheet layout for M2–M4; `creator_profile` handles; `/api/me/handle`.
- `(tabs)/create.tsx`: read `recipe` param, render `RecipeCard`, hide the locked chip groups, keep everything else (ideas, photo + consent, language, quality, price label, errors).
- `making/[id].tsx`: header sub only.
- `earn.tsx`: becomes the shared Earnings screen (remix X13); recipes add the Recipes chip and recipe rows.
- `song-rail.tsx` → generalise into a rail that takes a tile renderer (`RecipeTile`).
- `reel-video.tsx` for previews; `reel-thumb.tsx` as the poster fallback.
- Report sheet and reasons from gifts/Listen; web `/s/[publicId]` structure for `/r/`.
- `billing/credits.ts`: `grantCredits` as is; shared `paidRatio(db, userId)` and `settleEarning()` (one implementation for remixes and recipes).

### Acceptance criteria

1. A completed story, motion, dance or edit reel (not a music video, not from a recipe) shows **Share as a recipe**; the sheet lists what's shared and what stays private before anything is shared.
2. The stored `spec` never contains narration, title, idea text, character names, photo, video, brand or keyword (unit test on `buildRecipeSpec` with a script full of names).
3. `/r/{publicId}` renders with no cookie, shows Made with AI and Report, and returns the stopped / removed states when unpublished or taken down.
4. **Use this recipe** opens Create with format, look, length, music and shape locked; changing a locked value is only possible through **Make it without the recipe**, after which `film.recipeId` is null.
5. Price on the button equals the catalog price for the chosen quality and length.
6. A completed recipe reel by another user whose ledger is 150 purchase + 20 grant and who spent 72 credits creates a `creator_earning` of 635 hundredths and, on success, adds 6 credits (ledger reason `earning`) and shows "0.35 on the way" (0.3 at one decimal); a failed one is `dropped` and grants nothing; the same film never grants twice; a granted earning is never taken back.
7. The maker's own use grants nothing and doesn't change `useCount`.
8. Earned credits (`earning`) don't count as paid in the ratio; remix and recipe earnings appear on the same Earnings screen under All, and separately under their chips.
9. Festival collections appear on Create from 21 days before to 2 days after; Arabic or `Asia/Dubai` puts Gulf festivals first.
10. Hindi and Arabic layouts pass with 60% longer strings; Arabic mirrors rails and rows but not the video, its timeline or handles.

---

## Open questions for the owner (with my recommendation)

1. **Share percentage.** *Recommend:* keep 10% of paid credits for launch (decision 43's placeholder), stored per row as `rate_bp` (shared with remixes); it keeps margin positive on every reel. Consider 15% for the first festival season to seed recipes, then return to 10%.
2. **How "paid credits" is counted.** *Recommend:* the lifetime proportion (purchases + subscriptions ÷ all credits received), taken when the reel is charged; the same rule as remix chains. Alternative: a separate paid balance spent first; more exact but needs a balance migration and a spend-order rule that works against either the spender or the maker.
3. **Should free reels earn anything?** *Recommend:* no credits (decision 43 says paid only), but the maker sees "12 free reels" so popularity still shows. Alternative: a tiny fixed bonus per free use; it costs real money with no revenue behind it.
4. **What's locked.** *Recommend:* format, look, length, music, shape and effects locked; topic, photo, language and quality free. Alternative: let users change everything and still credit the maker; that makes "recipe" mean nothing and invites earning from barely-used recipes.
5. **Preview when real people are in the reel.** *Recommend:* off by default, and the maker turns it on after confirming the people agreed; otherwise a look card. Alternative: never show such reels; that loses most edit-my-video recipes.
6. **Recipes of recipe reels.** *Recommend:* not in v1. Feature 4 (remix chains) is where family trees and shared credit belong; reuse that model for recipes then.
7. **Music video recipes** (the user brings their own song). *Recommend:* phase 2; they're the most expensive reels (34–40 credits per 5 s), so they're the best earners, but they need a song picker in the flow.
8. **Caption credit default.** *Recommend:* "Recipe by @maker on Reelkar" on by default, one tap to remove. It's free reach for the maker and for Reelkar, and it's honest about where the reel came from.
9. **Web gallery.** *Recommend:* only recipe pages are public in v1, as with Listen; a public `/recipes/diwali` page can follow if festival links are shared a lot.
10. **Hindi word.** *Recommend:* रेसिपी (known from cooking reels). Alternative नुस्ख़ा reads like a home remedy; टेम्पलेट is CapCut's word and feels technical.
11. **One earnings model with remix chains.** *Aligned (coordinator, 2026-11-06):* one ledger reason `earning`, one `creator_earning` table (`source = remix | recipe`, hundredths), the proportional paid share, granted only on a successful result and never clawed back, and one Earnings screen (All · Remixes · Recipes) replacing the Earn placeholder. Needs the owner's yes once for both features.
