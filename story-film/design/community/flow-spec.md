# Community 1 and 2: Song gifts and Jugalbandi

Status: design spec v1, 2026-11-05. Not built. Follows PLAN.md decision 43 (community grows reach outside Reelkar; gifts first, duets second).
Design system: v3.0 Masala Pop (`design/v3.0/tokens.json`). Token names below are the ones in that file (`surface`, `surface-raised`, `ink`, `brand`, `on-brand`, `hero-start`/`hero-end`, `deep`, `on-deep`, `action`, `on-action`, `teal`, `teal-text`, `teal-tint`, `coral-tint`, `pop`, `line-strong`, `danger`, `scrim`).
Mockups: `design/community/mockups.html` (clickable iPhone screens, the public gift page at desktop and phone width, light/dark, English/Hindi/Arabic).
Builds with `mobile/src/components/ui.tsx` (`Screen`, `Header`, `Hero`, `Card`, `Button`, `Chip`, `ChipRow`, `Field`, `Banner`, `ProgressBar`, `Status`, `Win`, `Credits`, `Skeleton`, `ListRow`, `Empty`) and the Hum it screens in `mobile/src/app/(app)/hum/`.

---

## Feature 1: Song gift, with "Reply with your own song"

### Frame

- **Goal:** a song made for someone reaches them on WhatsApp, feels like a present, and pulls them into making one back.
- **One job per screen:** Gift step = say who it's for; Share = get it into WhatsApp; Gift page = open and enjoy; Reply = start a song back in one tap.
- **Success metrics:** 60% of gifts opened within 24 h; 15% of opened gifts get a "Reply" tap; 40% of those finish a reply (the growth loop). Gift step done in under 30 s.

### Flow

```
Sender (app)
  Song ready (hum/[id])  or  Song Studio (songs/[id])
    └─ "Make it a gift"  →  Gift step (/songs/[id]/gift)
          To · Occasion · Note · Cover (song cover | my photo | AI cover)
          └─ "Create gift link" → Gift ready + share sheet (WhatsApp first)
                └─ WhatsApp chat: link preview card (og:image 1200×630)
  Later: push "Priya opened your gift" → Gift status card (Inbox / My songs › Gifts)
         push "Priya sent you a song back" → Gift thread: play reply, "Reply again"

Recipient (web, no sign-in)  reelkar.app/g/{token}
  Sealed → tap "Open your gift" (starts audio, counts the open) → Playing (karaoke lyrics, note)
     ├─ processing → "almost ready" (auto-check every 10 s)
     ├─ audio fails → retry in place
     ├─ slow network → text first, cover colour block, play shows "Loading…"
     ├─ removed / taken down → "isn't available any more" + make your own
     └─ "Reply with your own song" → one-screen sign-up (Apple · Google · phone OTP)
           → app (or web) Reply chooser: Hum it | Describe it  (prefilled: for Rajnish · Birthday · reply)
           → Hum it Record → Confirm (price shown) → Making → Ready
           → "Send it back to Rajnish" (gift step prefilled) → threaded under the original gift
```

### Screens (iPhone)

| # | Screen | Route | Reuses |
|---|---|---|---|
| G1 | Song ready, with "Make it a gift" | `hum/[id]` and `songs/[id]` | existing screens, one new secondary button |
| G2 | Make it a gift | `songs/[id]/gift` (new) | `Field`, `ChipRow`, `SongCover`, `Credits` |
| G3 | Gift ready + share sheet | same route, `state=ready` | `Win`, new `ShareSheet` |
| G4 | WhatsApp preview (what they see) | n/a (it's WhatsApp) | og image rendered server-side |
| G5 | Gift status card (in Inbox and My songs › Gifts) | `(tabs)/inbox`, `songs/index` | `Card`, `Status`; Inbox stops being "coming soon" |
| G6 | Push notifications | n/a | Expo notifications (new dependency) |
| G7 | Gift thread | `gifts/[id]` (new) | `SongPlayerRow`, `Card` |
| R1 | Gift page (phone browser) | web `/g/[token]` (new) | web `reel-player.tsx` audio parts |
| R2 | One-screen sign-up | web `/g/[token]/join`; app `(auth)/sign-in` | `login-form.tsx` (web), `sign-in.tsx` + `otp.tsx` (app, merged into one screen with inline code) |
| R3 | How do you want to reply? | `gifts/reply?to={token}` (new) | `ListRow`, `Card` |
| R4 | Hum it Record, reply mode | `hum/index?gift={token}` | Hum it Record, plus a reply banner |
| R5 | Confirm, reply mode | `hum/confirm` | Hum it Confirm, topic + occasion prefilled |
| R6 | Reply ready → send it back | `songs/[id]/gift?replyTo={giftId}` | G2/G3 with recipient locked |

### G1. Entry

- `hum/[id]` (Ready) and `songs/[id]` (Studio, under the player): add `Button kind="secondary" icon="gift" label="Make it a gift"`. On `hum/[id]` it sits after "Mix and save"; on `songs/[id]` it replaces nothing and sits above "Make music video".
- Only enabled when `status === "completed"`. Instrumentals can be gifts too (a tune is a fine gift); the lyrics panel is simply hidden on the page.

### G2. Make it a gift

Layout (`Screen` with footer, `Header title="Make it a gift" back`):
1. Live preview card at top: the gift card as the recipient will see it (cover, "A birthday song for Priya", "From Rajnish"). Updates as fields change. 160 pt tall, `radius-lg`.
2. **To** `Field` "Who is it for?" placeholder "Priya". Max 40 chars. Required.
3. **Occasion** `ChipRow` (single): Birthday · Wedding · Eid · Diwali · Anniversary · Rakhi · Just because. Pre-selected from the song's topic when the AI can tell ("a birthday song for my sister" → Birthday). Wraps to two rows in Hindi/Arabic.
4. **Note** `Field multiline` "Add a note (optional)", 200 chars, counter `ink-muted`.
5. **Cover** three 72 pt tiles in a row: **Song cover** (default, the AI art already made) · **My photo** (photo picker, cropped 1:1) · **AI cover** (made from the occasion + name, e.g. diyas and marigolds for Diwali). AI cover shows `ReelLogo loop` in the tile while making (~8 s). Selected tile: 3 pt `action` ring + check badge (never colour alone).
6. Caption: "Free · anyone with the link can play it. You can stop sharing any time."
7. Voice line (only if the song is in the sender's own voice): `Status kind="ok"` "Sung in your own voice. People can play it, but nobody can re-sing in your voice."

Footer primary: **Create gift link** (disabled until To is filled; disabled label stays readable).

States: idle · AI cover making · AI cover failed ("Couldn't make the cover. Using the song cover." with **Try again**) · photo permission denied (Banner warn + Settings) · creating link (button loading) · offline ("You're offline. Your gift details are kept.").

Decision: the gift is free, including one AI cover. *Why: every gift is an ad that lands in a WhatsApp chat; charging for it taxes our best acquisition channel.*

### G3. Gift ready + share sheet

- `Win text="Your gift is ready"`, the preview card, then a custom bottom sheet (not the iOS share sheet, because iOS can't put WhatsApp first):
  - Row 1, full-width primary `Button` in **chilli `action`** (not WhatsApp green) with the WhatsApp glyph and label **Send on WhatsApp**. *Why: one brand primary per screen; the glyph carries the recognition.* Opens `whatsapp://send?text={message}`; falls back to the system sheet when WhatsApp isn't installed.
  - Row 2, three 64 pt icon tiles: **WhatsApp status** · **Copy link** · **More** (system share sheet: Instagram DM, Telegram, SMS, Botim).
  - Prefilled message (editable later in WhatsApp): "Priya, I made you a birthday song 🎂 Open it here: reelkar.app/g/x7Kp2" (en) / localised versions below. Emoji only inside the user's outgoing message, never as UI icons.
- Under the sheet: "See who opened it in Inbox."
- Link is lasting (no expiry) and revocable: **Stop sharing** lives on the gift thread (G7).

### G4. WhatsApp link preview

- `og:image` 1200×630 PNG, rendered once per gift on the server (Skia, same stack as reels; ~60 KB): left 630×630 cover, right panel `hero` gradient with "A birthday song" (Bricolage 64 px, plum `on-brand`), "for Priya" (Bricolage 88 px), "From Rajnish" (Inter 36 px), "Made with AI" pill bottom-right, reel mark bottom-left. Arabic gifts flip the card: cover on the right, text right-aligned.
- `og:title`: "A birthday song for Priya, from Rajnish"
- `og:description`: "Tap to open your gift. Made with AI on Reelkar."
- `og:site_name`: "Reelkar". `og:type`: `music.song`. `og:audio` is not set (WhatsApp ignores it and some apps autoplay).
- The note is never in the preview. *Why: keeps the surprise for the reveal, and notes are personal.*

### G5. Gift status card

Shown in **Inbox** (new section "Gifts and duets", above the existing comments coming-soon card) and **My songs › Gifts** (a second segment on `songs/index`).

| State | Line | Action |
|---|---|---|
| Sent, not opened | "Sent to Priya · not opened yet" | **Send again** (re-opens the share sheet) |
| Opened | "Opened · 2 plays · last 3 h ago" | **Open** |
| Replied | "Priya sent you a song back" `teal` dot + "New" pill | **Play reply** (primary, inline) |
| Stopped sharing | "Not shared any more" | **Share again** |
| Removed after a report | "Removed after a report. Ask for a review." | **Ask for a review** (opens the grievance form) |

Privacy decision: the sender sees **opened yes/no, play count and last-played time only**. No IP, city, device or viewer identity. "Priya" is the name the sender typed, not a verified person; the copy says "Opened", and the card reads "Opened · 2 plays", with the recipient name in the title ("Birthday song for Priya"). Identity appears only when someone replies (they sign in to do that). Sender's own plays are not counted (signed-in owner session, or the `?preview=1` link the app opens).
The gift page tells the recipient this plainly (see R1).

### G6. Push notifications

- Opened (first open only, never per play): title "Priya opened your gift", body "Your birthday song has been played." Deep link `gifts/[id]`. Later plays are not pushed.
- Reply: title "Priya sent you a song back", body "Tap to play it." Deep link `gifts/[id]#reply-{replyId}`.
- Batched: if more than 3 gifts open in an hour, one push "3 of your gifts were opened".

### G7. Gift thread

`Header title="Birthday song for Priya" back`. A vertical thread, oldest first:
1. Your gift card: cover, player (`SongPlayerRow`), note, "Opened · 2 plays".
2. Reply card(s): "From Priya · Hum it · 0:42", player, her note, "Made with AI".
3. Footer primary: **Reply again** (same reply chooser, recipient = Priya). Secondary row: **Share** (her reply goes on WhatsApp as its own gift link) · **Stop sharing** (with a confirm: "Stop sharing this gift? The link will stop working. You can share it again later.").

Each reply is its own gift (own token, own page) with `replyToGiftId` linking them; the public page of a reply shows "A reply to your birthday song" and a link back to the original.

### R1. Public gift page (`/g/{token}`, no sign-in)

One hero card per page (v3.0 rule): the gift itself.

Sealed (first visit):
- Full-height `hero` gradient card, `on-brand` text: overline "A song for you", headline **"Priya, Rajnish made you a song"**, occasion chip "Birthday", the cover shown as a wrapped box (cover visible through a ribbon cut-out).
- Primary **Open your gift** (`deep` fill on the hero, 56 pt, because chilli on saffron fails 3:1; same rule as the Hum it mic). The tap is the user gesture that starts audio, so the song plays on open without autoplay hacks.
- Under it: "Made with AI" pill and "Plays with sound" hint.

Open (the reveal): the ribbon slides away and the cover scales up (400 ms, ease-out); 12 marigold petals fall once. With reduced motion: a 150 ms cross-fade, no petals.

Playing:
- Cover 1:1 (max 320 px), title, "From Rajnish · Birthday · 1:48".
- Player: 56 pt play/pause, scrubber, `0:42 / 1:48` in `timecode`. Media controls and the scrubber are **not mirrored** in Arabic.
- **Karaoke lyrics**: lines in a scroll well; the current line is `ink` at 700 with the sung words filled `action`-on-tint (word-level when timings exist, line-level otherwise); past lines `ink-muted`; upcoming lines `ink` 400. Auto-scroll keeps the current line in the upper third; a manual scroll pauses auto-scroll for 5 s and shows **Follow along**. Tapping a line seeks to it.
- Sender's note in a `surface-raised` card with a quote mark, "Rajnish wrote:".
- **Reply with your own song**: the one primary (`action`), full width, pinned to the bottom on phones after the first 10 s of play or when the song ends. Caption: "Free to start · takes about a minute".
- Footer: "Made with AI on Reelkar" · privacy line "Rajnish sees that this was opened and how often it played. Nothing else." · **Report** · Terms.

Error and edge states:

| State | Trigger | What shows |
|---|---|---|
| Processing | reply gift sent before its song finished | Hero stays sealed; headline "Your song is almost ready"; helper "Rajnish's song is being made. This page checks again by itself."; `ReelLogo loop`; polls every 10 s up to 5 min, then "Still making it. Come back in a few minutes." |
| Audio fails | `<audio>` error or stall > 8 s | Inline `Banner kind="error"` in the player: "The song didn't load. Check your internet and tap to try again." + **Try again**; lyrics and note stay readable |
| Slow network | effective type 2g/3g, or first byte > 2 s | Page shell < 40 KB, renders text first; cover replaced by its dominant colour block until loaded; audio `preload="metadata"` and a 64 kbps AAC rendition; play button reads "Loading…" with a determinate ring when buffering |
| Removed by sender | token revoked | "This gift isn't available any more. The person who sent it stopped sharing it." + **Make your own song** (ghost) |
| Taken down | report upheld | "This gift was removed after a report." + **Make your own song** |
| Unknown token | typo, bad link | 404 page with the same layout: "We couldn't find this gift. Check the link and try again." |
| No lyrics | instrumental | Lyrics well hidden; "A tune made for you" under the title |
| Sender's own voice | song uses their cloned voice | Pill "Sung in Rajnish's own voice" next to Made with AI |

### Report (every public page)

- **Report** link in the footer of every public page (gift, reply, duet invite, error pages) and in the page's ⋯ menu.
- Opens a sheet: reason radio list (It uses my voice or likeness without consent · Copyright · Hateful or abusive · Sexual content involving a minor · Something else), optional details (500 chars), optional email for a reply. **Send report**. Confirmation: "Thanks. We'll review it within 24 hours." Grievance officer contact link (India IT Rules 2021; UAE equivalent) under it.
- No sign-in needed. Rate-limited per IP. No other gates (decision 43: only what the law needs).

### R2. One-screen sign-up

Opened from **Reply with your own song**. One screen, no steps to scroll:
- Title "Reply to Rajnish" with the gift cover thumb; helper "Make a song back. Free to start."
- **Continue with Apple** · **Continue with Google** (secondary, 52 pt each).
- "or" divider; phone `Field` with country code chip (+91 default, +971 when the browser locale is Arabic/UAE); **Send code**. The 6-digit code field appears in place under it (same screen), auto-filled from SMS where the OS allows; **Verify** becomes the primary.
- Small print: "By continuing you agree to the Terms. We'll never post without asking."
- New accounts get the existing welcome credits (enough for one Hum it song).
- After sign-in: on a phone with the app installed, a universal link opens `reelkar://gifts/reply?to={token}`; otherwise the web reply chooser (`/create/song` and `/create/hum` on web) with the same prefill. App install is offered, not required.

### R3. How do you want to reply?

`Header title="Reply to Rajnish"`. Prefill summary chip row (read-only, tap to change): **For Rajnish** · **Birthday** · **Reply**.
Two big cards (`Card onPress`, 96 pt each):
- **Hum it**, "Hum, sing or just say it" (mic icon on `deep`).
- **Describe it**, "Write one line, AI does the rest" (Simple song, `songs/new?mode=simple`).
Caption: "Hum it · 2 credits · you have 6 free credits" (placeholder numbers follow the live prices).
Voice note (always): "You can sing it in an AI voice or your own voice. Rajnish's voice can't be used."

### R4–R6. Reply making

- **R4** = Hum it Record (`hum/index`) with a `Banner kind="info"` at top: "Replying to Rajnish's birthday song" and a 44 pt **Play theirs** button (so they can hum along to the same tune). Nothing else changes.
- **R5** = Hum it Confirm with the topic prefilled "A thank-you song for Rajnish, for my birthday" (editable), occasion chip, and the voice picker limited to AI singers + the replier's own voices. Price on the button as today ("Make it · 2 credits").
- Making and Ready are unchanged; Ready shows primary **Send it back to Rajnish** (replaces "Mix and save" as primary; Mix becomes secondary).
- **R6** = G2 with **To** locked to "Rajnish" (sender's display name), occasion kept, note empty. Share sheet same as G3, plus "Rajnish will also get it in the Reelkar app." (in-app delivery to the original sender is automatic, because the thread knows them).

### Voice rule (gifts)

- A gift may be sung in the sender's own cloned voice. Anyone with the link can play it.
- No one else can use that voice: the reply's voice picker lists only AI singers and the replier's own consented voices. There is no "use their voice" option, and the API refuses a `voiceId` the caller doesn't own.
- Remix/cover of a gift is not offered (remix chains are feature 4 and will follow the same rule).

---

## Feature 2: Jugalbandi (two-creator duet)

### Frame

- **Goal:** two creators make one song together from two phones and post it as one Instagram Collab, so each reaches the other's audience.
- **One job per screen:** Start = topic and price; Record = your part; Invite = get the partner; Wait = know what's next; Preview = both say yes; Post = one collab post.
- **Success metrics:** 50% of invites get a recorded part within 48 h; 70% of joined duets get posted; each posted duet brings 0.3 new sign-ups (partner + viewers).

### Name

Keep **Jugalbandi** (जुगलबंदी) for English and Indic UIs: it's the Hindustani word for two musicians trading lines, and it says "duet with a friend" better than "Duet". Arabic UI: **دويتو** (duet), with "Jugalbandi" not shown, because the word means nothing in the Gulf. Owner decision (see open questions).

### Flow

```
A (starter)
  Create tab tile "Jugalbandi"  or  Hum it Record "Sing with a friend"
   └─ D1 Start: topic · genre · who pays (price shown, credits held, not spent)
       └─ D2 Record your part (Hum it Record, part mode, ≤ 30 s) → review → Use this
           └─ D3 Invite: @handle search  |  Send link on WhatsApp  |  Copy link
               └─ D4 Waiting for Sana (48 h clock)
                    ├─ 24 h: auto reminder to B (push / in-app); A can tap Remind once
                    ├─ B declines → D10 options
                    ├─ 48 h no answer → D10 options: invite someone else · finish solo · give 24 h more
                    └─ B recorded → D7 Joining (~2 min) → D8 Preview: retakes, both approve
                         └─ D9 Post: Instagram Collab (+ YouTube optional) → D11 Posted

B (partner)
  push / Inbox card / WhatsApp link (reelkar.app/j/{token})
   ├─ has app → D5 Invite: hear A's part · Sing your part · Not this time · offer to split
   └─ no app → web invite page (W3) → install or sign up (one screen) → D5 (deep link)
       └─ D6 Record your part (A's part in earphones) → Use this → D7 Joining → D8 Preview → approve
           └─ gets the Instagram collab invite in Instagram → accepts there
```

### Screens (iPhone)

| # | Screen | Route | Reuses |
|---|---|---|---|
| D1 | Start a Jugalbandi | `duets/new` (new) | `Field`, `ChipRow` (genres from `songs/new`), `Credits` |
| D2 | Record your part (A) | `hum/index?duet={id}&part=a` | Hum it Record |
| D3 | Invite your partner | `duets/[id]/invite` (new) | `Field` (search), `ListRow`, G3 share sheet |
| D4 | Waiting (A) | `duets/[id]` state `waiting` | `Hero`, `ProgressBar`, `Status` |
| D5 | Invite (B), in-app | `duets/[id]` state `invited`; Inbox card | `SongPlayerRow`, `Card` |
| D6 | Record your part (B) | `hum/index?duet={id}&part=b` | Hum it Record + "play their part" toggle |
| D7 | Joining | `duets/[id]` state `joining` | `making/[id]` progress pattern |
| D8 | Joined preview + approve | `duets/[id]` state `review` | `SongPlayerRow`, waveform (`components/waveform`) |
| D9 | Post as a Collab | `duets/[id]/post` → reuses `reel/[id]` "Post it" + "Caption" cards | `reel/[id].tsx` post and caption code |
| D10 | No answer / declined | `duets/[id]` state `expired` / `declined` | `Card`, `ListRow` |
| D11 | Posted | `duets/[id]` state `posted` | `Win` |
| W3 | Web invite page | web `/j/{token}` (new) | gift page layout |

### D1. Start a Jugalbandi

- `Header title="Jugalbandi" sub="Make" back right={<Credits/>}`.
- Hero (small): "Make a song with a friend" / "You sing one part, they sing the other. AI joins them into one song."
- **What's it about?** `Field` placeholder "Two friends arguing about chai vs coffee".
- **Style** `ChipRow` (same genres as Song Studio: Bollywood, Punjabi, Sufi, Indie pop, Khaleeji, Rap…).
- **Who pays** card: "You pay **6 credits** *(placeholder)*" · "Your partner can offer to pay half." · "Credits are held now and only spent when the song is joined. Not joined, not spent."
- Footer primary **Record my part**. Caption "About 30 seconds each · you'll both approve before anything is posted".
- No credits → primary becomes **Get credits** (existing `/credits`).

Placeholder price (clearly marked in UI mocks and here): **6 credits = a song (4) + a song on your tune (2)**. Music video is extra at its normal price.

### D2 / D6. Record your part

Hum it Record, unchanged, plus:
- Header title "Your part" sub "Jugalbandi with Sana" (B: "with Arjun").
- Part chip in the hero: "Part 1 · first verse and chorus" (A) / "Part 2 · second verse, answer them" (B). Limit 30 s, warning at 0:25.
- **Sing in** row (only if the user has a consented voice): `ChipRow` **AI singer** · **My voice**. B's row never lists A's voices and vice versa. Default AI singer.
- B only: toggle **Play Arjun's part while I record** with helper "Wear earphones so it isn't recorded too." On by default when wired/Bluetooth headphones are connected, off otherwise. **Play Arjun's part** 44 pt button always available above the mic.
- Review state: "Use this" → for A goes to D3; for B goes to D7 and A is notified.

### D3. Invite your partner

- Your part card (play, 0:28, "Ready").
- **Find on Reelkar** search `Field` "Name or @handle" → results `ListRow` with avatar, name, @handle, "Invite" button (44 pt). Self and blocked people are not listed.
- divider "or send a link"
- Primary **Send invite on WhatsApp** (message: "Sing a Jugalbandi with me on Reelkar 🎤 Hear my part: reelkar.app/j/r4Qm"), tiles **Copy link** · **More**.
- Caption: "The invite is open for 48 hours. One partner at a time."

### D4. Waiting (A)

- Hero: "Waiting for Sana" / "She has 47 hours to sing her part." `ProgressBar` of the 48 h window (`onBrand`), status chips "Your part ✓ recorded" · "Sana's part · not yet" (icon + text, not colour only).
- Card actions: **Remind Sana** (enabled after 12 h, once; "Reminder sent" after) · **Send link again** · **Cancel Jugalbandi** (ghost, confirm: "Cancel? Your 6 credits come back.").
- Status changes to "Sana opened the invite" and "Sana is recording" (from her app) so A isn't waiting blind.

### D5. Invite (B)

Delivered three ways: push "Arjun wants a Jugalbandi with you" / "Hear his part and sing yours"; **Inbox** card (Gifts and duets section) with play button; WhatsApp link.
Screen:
- Hero: "Arjun wants to sing with you" / topic in quotes / style chip / "Open for 47 more hours".
- A's part card with player (0:28) and "Arjun's voice · AI singer" (or "Arjun's own voice", which B can hear but never use).
- **Sing your part** primary. Under it: toggle **Offer to pay half (3 credits)** *(placeholder)*, off by default, with "Arjun pays unless you offer."
- **Not this time** ghost → confirm sheet with optional one-line note → A gets "Sana can't join this time".
- "Posted as an Instagram Collab from Arjun's account. You'll both approve it first."

### D7. Joining

Both phones: Hero "Joining your parts" / "About 2 minutes. You can leave; we'll tell you both." `ReelLogo` long-wait rings; steps list (`CheckRow`): Matching the tune ✓ · Singing both parts · Mixing. Push to both when ready. Failure: "That didn't work. Nothing was spent. Try again" (re-runs with the same parts).

### D8. Joined preview + approve

- Player with a two-colour part strip under the scrubber: Part 1 band `pop` labelled "Arjun", Part 2 band `teal` labelled "Sana" (labels inside the bands, so not colour alone). Tapping a band plays that part.
- Lyrics card (both parts, with names as section headings).
- Approval row: "You ✓ approved" · "Sana · not yet" (avatars + text).
- Primary **Looks good, approve** → after both: **Post it** (to D9; only A posts).
- Secondary row: **Retake my part** (back to D2/D6, keeps the other part; 1 free retake each, then 1 credit, *placeholder*) · **Ask Sana to retake** (sends a push with optional note; Sana's card shows "Arjun asked you to retake").
- **Make a music video** (optional, existing `songs/video/[id]`, normal price shown before spending).
- Any retake resets both approvals. Either person can say **Remove my part** (ends the duet; the other can finish solo; credits as in D10).

### D9. Post as a Collab (reuse `reel/[id]`)

Reuses the existing "Post it" card (account picker, Post now / Schedule) and "Caption" card (AI caption per platform). Changes:
- Instagram row shows a locked toggle **Collab with @sana.sings** (on). Under it: "Sana gets an invite in Instagram. Once she accepts, it shows on both profiles."
- B's Instagram handle comes from B's connected account, or B types it on D5 ("Your Instagram @"), stored on the duet.
- Caption is written with both handles: "Chai vs coffee, settled in song ☕ with @sana.sings · Made with AI on Reelkar" and the platform's AI label; YouTube optional (same caption; YouTube has no co-authors, so B is credited in the description).
- Post goes from A's account through the Graph API `collaborators` field on the Reel container.
- Both are credited in Reelkar (the duet appears in both people's My songs with "Jugalbandi with …").
- B can also save or share the video herself (existing Save / Share buttons).

### D10. No answer / declined

Hero (no gradient; `deep` alert card): "Sana didn't answer" (or "Sana can't join this time" + her note).
Three `ListRow` options, primary first:
1. **Invite someone else** → D3 (your part kept, new 48 h clock).
2. **Finish it solo** → becomes a normal Hum it song from your part: "Uses 2 credits. The other 4 come back." *(placeholder numbers)*
3. **Give Sana 24 more hours** (only for no answer, once).
Ghost: **Cancel and get all 6 credits back**.
Timeline: 0 h invite → 24 h auto reminder to B ("Arjun's Jugalbandi closes tomorrow") → 48 h close; A gets push "Sana didn't sing her part. Choose what's next." If A does nothing for 7 days, the hold is released automatically (all credits back) and the part is kept as a draft.

### Credits and refunds

| Event | A (pays) | B (offered half) |
|---|---|---|
| Start | 6 held | — |
| B offers half and records | A's hold drops to 3 | 3 held from B |
| Joined OK | held credits spent | held credits spent |
| Join fails | all holds released | released |
| Declined / no answer → cancel | 6 back | — |
| Finish solo | 2 spent, 4 back | — |
| Retake beyond the free one | the retaker pays 1 | the retaker pays 1 |
| Music video | whoever taps it, normal price | — |

All placeholders. "Held" = shown in the credits screen as "Held for Jugalbandi · 6", not spendable, never silently charged.

### Voice rule (Jugalbandi)

Each part is sung by an AI singer or **its own author's** consented voice. The server checks `part.voiceId.ownerId === part.userId`. A's voice never appears in B's picker. Retakes keep that rule. The joined song's page and post say "Made with AI"; if a real voice is used, "Sung in Arjun's own voice" is added.

### W3. Web invite page (`/j/{token}`)

Same shell as the gift page: hero "Arjun wants to sing a Jugalbandi with you", A's part player, topic, style, "Open for 47 more hours", primary **Sing your part** → one-screen sign-up (R2 pattern) → "Get the app to record" with App Store button + QR on desktop; the invite token travels through sign-in (stored server-side against the new account), so the app opens straight on D5 after install. Expired: "This invite has closed. Ask Arjun to send a new one." Made with AI + Report in the footer.

---

## Copy (English · Hindi · Arabic)

ICU message format; `{n}` plurals use ICU `plural` (Arabic needs zero/one/two/few/many/other). Names are wrapped in bidi isolates (`<bdi>` on web, `⁨…⁩` in RN) so "Priya" in an Arabic sentence doesn't reorder.

| Key | English | Hindi | Arabic |
|---|---|---|---|
| `gift.make` | Make it a gift | इसे तोहफ़ा बनाएँ | اجعلها هدية |
| `gift.to.label` | Who is it for? | यह किसके लिए है? | لمن هذه الهدية؟ |
| `gift.occasion.label` | Occasion | मौक़ा | المناسبة |
| `gift.occasion.birthday` | Birthday | जन्मदिन | عيد ميلاد |
| `gift.occasion.wedding` | Wedding | शादी | زفاف |
| `gift.occasion.eid` | Eid | ईद | العيد |
| `gift.occasion.diwali` | Diwali | दिवाली | ديوالي |
| `gift.occasion.anniversary` | Anniversary | सालगिरह | ذكرى سنوية |
| `gift.occasion.rakhi` | Rakhi | राखी | راخي |
| `gift.occasion.none` | Just because | बस यूँ ही | بلا مناسبة |
| `gift.note.label` | Add a note (optional) | संदेश लिखें (चाहें तो) | أضف رسالة (اختياري) |
| `gift.cover.label` | Cover picture | कवर फ़ोटो | صورة الغلاف |
| `gift.cover.song` | Song cover | गाने का कवर | غلاف الأغنية |
| `gift.cover.photo` | My photo | मेरी फ़ोटो | صورتي |
| `gift.cover.ai` | AI cover | AI कवर | غلاف بالذكاء الاصطناعي |
| `gift.free` | Free · anyone with the link can play it. You can stop sharing any time. | मुफ़्त · लिंक वाला कोई भी इसे सुन सकता है। आप कभी भी शेयर करना बंद कर सकते हैं। | مجانًا · يمكن لأي شخص لديه الرابط تشغيلها. يمكنك إيقاف المشاركة في أي وقت. |
| `gift.create` | Create gift link | तोहफ़े का लिंक बनाएँ | أنشئ رابط الهدية |
| `gift.ready` | Your gift is ready | आपका तोहफ़ा तैयार है | هديتك جاهزة |
| `gift.share.whatsapp` | Send on WhatsApp | WhatsApp पर भेजें | أرسلها عبر واتساب |
| `gift.share.status` | WhatsApp status | WhatsApp स्टेटस | حالة واتساب |
| `gift.share.copy` | Copy link | लिंक कॉपी करें | انسخ الرابط |
| `gift.share.more` | More | और | المزيد |
| `gift.message` | {to}, I made you a {occasion} song. Open it here: {url} | {to}, मैंने तुम्हारे लिए {occasion} का गाना बनाया है। यहाँ खोलो: {url} | {to}، صنعتُ لك أغنية {occasion}. افتحها من هنا: {url} |
| `gift.og.title` | A {occasion} song for {to}, from {from} | {from} की ओर से {to} के लिए {occasion} का गाना | أغنية {occasion} إلى {to} من {from} |
| `gift.og.desc` | Tap to open your gift. Made with AI on Reelkar. | अपना तोहफ़ा खोलने के लिए टैप करें। Reelkar पर AI से बना। | اضغط لفتح هديتك. صُنعت بالذكاء الاصطناعي على Reelkar. |
| `page.overline` | A song for you | आपके लिए एक गाना | أغنية لك |
| `page.headline` | {to}, {from} made you a song | {to}, {from} ने आपके लिए एक गाना बनाया है | {to}، صنع لك {from} أغنية |
| `page.open` | Open your gift | अपना तोहफ़ा खोलें | افتح هديتك |
| `page.sound` | Plays with sound | आवाज़ के साथ चलेगा | يعمل مع الصوت |
| `page.note.by` | {from} wrote: | {from} ने लिखा: | كتب {from}: |
| `page.reply` | Reply with your own song | अपने गाने से जवाब दें | ردّ بأغنية من صنعك |
| `page.reply.sub` | Free to start · takes about a minute | शुरू करना मुफ़्त · लगभग एक मिनट | البدء مجاني · يستغرق دقيقة تقريبًا |
| `page.ai` | Made with AI | AI से बना | صُنع بالذكاء الاصطناعي |
| `page.ownVoice` | Sung in {from}'s own voice | {from} की अपनी आवाज़ में | بصوت {from} الحقيقي |
| `page.privacy` | {from} sees that this was opened and how often it played. Nothing else. | {from} को सिर्फ़ इतना दिखेगा कि यह खुला और कितनी बार चला। | سيرى {from} فقط أنها فُتحت وكم مرة شُغّلت. لا شيء غير ذلك. |
| `page.report` | Report | शिकायत करें | إبلاغ |
| `page.follow` | Follow along | साथ-साथ पढ़ें | تابع الكلمات |
| `page.processing.title` | Your song is almost ready | आपका गाना लगभग तैयार है | أغنيتك على وشك أن تجهز |
| `page.processing.text` | It's still being made. This page checks again by itself. | यह अभी बन रहा है। यह पेज खुद दोबारा देखेगा। | ما زالت قيد الإعداد. ستتحقق هذه الصفحة تلقائيًا. |
| `page.audioError` | The song didn't load. Check your internet and tap to try again. | गाना लोड नहीं हुआ। इंटरनेट देखें और फिर से टैप करें। | لم تُحمَّل الأغنية. تحقّق من الإنترنت واضغط للمحاولة مجددًا. |
| `page.retry` | Try again | फिर से कोशिश करें | حاول مجددًا |
| `page.loading` | Loading… | लोड हो रहा है… | جارٍ التحميل… |
| `page.removed` | This gift isn't available any more. The person who sent it stopped sharing it. | यह तोहफ़ा अब उपलब्ध नहीं है। भेजने वाले ने इसे शेयर करना बंद कर दिया है। | هذه الهدية لم تعد متاحة. أوقف المُرسِل مشاركتها. |
| `page.takenDown` | This gift was removed after a report. | शिकायत के बाद यह तोहफ़ा हटा दिया गया। | أُزيلت هذه الهدية بعد بلاغ. |
| `page.makeOwn` | Make your own song | अपना गाना बनाएँ | اصنع أغنيتك |
| `join.title` | Reply to {from} | {from} को जवाब दें | ردّ على {from} |
| `join.sub` | Make a song back. Free to start. | बदले में एक गाना बनाएँ। शुरू करना मुफ़्त। | اصنع أغنية في المقابل. البدء مجاني. |
| `join.apple` | Continue with Apple | Apple से जारी रखें | المتابعة باستخدام Apple |
| `join.google` | Continue with Google | Google से जारी रखें | المتابعة باستخدام Google |
| `join.phone` | Mobile number | मोबाइल नंबर | رقم الجوال |
| `join.sendCode` | Send code | कोड भेजें | أرسل الرمز |
| `join.verify` | Verify | पुष्टि करें | تحقّق |
| `status.notOpened` | Sent to {to} · not opened yet | {to} को भेजा · अभी खोला नहीं | أُرسلت إلى {to} · لم تُفتح بعد |
| `status.opened` | Opened · {n, plural, one {# play} other {# plays}} | खुला · {n} बार सुना | فُتحت · {n, plural, zero {لم تُشغَّل} one {تشغيل واحد} two {تشغيلان} few {# تشغيلات} other {# تشغيل}} |
| `status.replied` | {to} sent you a song back | {to} ने बदले में गाना भेजा | أرسل لك {to} أغنية ردًّا |
| `push.opened` | {to} opened your gift | {to} ने आपका तोहफ़ा खोला | فتح {to} هديتك |
| `reply.again` | Reply again | फिर से जवाब दें | ردّ مرة أخرى |
| `reply.sendBack` | Send it back to {from} | {from} को वापस भेजें | أرسلها إلى {from} |
| `reply.voiceRule` | You can sing it in an AI voice or your own voice. {from}'s voice can't be used. | आप AI आवाज़ या अपनी आवाज़ में गा सकते हैं। {from} की आवाज़ इस्तेमाल नहीं हो सकती। | يمكنك الغناء بصوت ذكاء اصطناعي أو بصوتك. لا يمكن استخدام صوت {from}. |
| `gift.stop` | Stop sharing | शेयर करना बंद करें | أوقف المشاركة |
| `duet.name` | Jugalbandi | जुगलबंदी | دويتو |
| `duet.start.title` | Make a song with a friend | दोस्त के साथ गाना बनाएँ | اصنع أغنية مع صديق |
| `duet.start.text` | You sing one part, they sing the other. AI joins them into one song. | एक हिस्सा आप गाएँ, दूसरा वो। AI दोनों को एक गाना बना देगा। | تغنّي جزءًا ويغنّي صديقك الآخر، ويجمعهما الذكاء الاصطناعي في أغنية واحدة. |
| `duet.price` | You pay {n} credits (placeholder) | आप {n} क्रेडिट देंगे | تدفع {n} رصيد |
| `duet.held` | Held now, spent only when the song is joined. | अभी रोके जाएँगे, गाना जुड़ने पर ही खर्च होंगे। | تُحجز الآن ولا تُخصم إلا عند دمج الأغنية. |
| `duet.recordMine` | Record my part | अपना हिस्सा रिकॉर्ड करें | سجّل جزئي |
| `duet.invite.title` | Invite your partner | अपने साथी को बुलाएँ | ادعُ شريكك |
| `duet.invite.whatsapp` | Send invite on WhatsApp | WhatsApp पर न्योता भेजें | أرسل الدعوة عبر واتساب |
| `duet.waiting` | Waiting for {b} | {b} का इंतज़ार | بانتظار {b} |
| `duet.hoursLeft` | {n} hours left | {n} घंटे बाकी | متبقٍ {n} ساعة |
| `duet.remind` | Remind {b} | {b} को याद दिलाएँ | ذكّر {b} |
| `duet.invited` | {a} wants to sing with you | {a} आपके साथ गाना चाहते हैं | يريد {a} أن يغنّي معك |
| `duet.singYours` | Sing your part | अपना हिस्सा गाएँ | غنِّ جزءك |
| `duet.split` | Offer to pay half ({n} credits) | आधा देने की पेशकश करें ({n} क्रेडिट) | اعرض دفع النصف ({n} رصيد) |
| `duet.decline` | Not this time | इस बार नहीं | ليس هذه المرة |
| `duet.earphones` | Wear earphones so it isn't recorded too. | ईयरफ़ोन लगाएँ ताकि वह भी रिकॉर्ड न हो। | ارتدِ السماعات حتى لا يُسجَّل معك. |
| `duet.joining` | Joining your parts | आपके हिस्से जोड़े जा रहे हैं | جارٍ دمج الجزأين |
| `duet.approve` | Looks good, approve | ठीक है, मंज़ूर | يبدو رائعًا، موافق |
| `duet.retakeMine` | Retake my part | मेरा हिस्सा फिर से | أعِد تسجيل جزئي |
| `duet.askRetake` | Ask {b} to retake | {b} से दोबारा गाने को कहें | اطلب من {b} إعادة التسجيل |
| `duet.collab` | Collab with {handle} | {handle} के साथ Collab | تعاون مع {handle} |
| `duet.noAnswer` | {b} didn't answer | {b} ने जवाब नहीं दिया | لم يردّ {b} |
| `duet.inviteOther` | Invite someone else | किसी और को बुलाएँ | ادعُ شخصًا آخر |
| `duet.solo` | Finish it solo | अकेले पूरा करें | أكملها وحدك |
| `duet.extend` | Give {b} 24 more hours | {b} को 24 घंटे और दें | امنح {b} ‏24 ساعة إضافية |

### Language rules

- **Hindi (and other Indic):** body text in Hind via the token font stack; body line height 1.6 (24/15 → 25/15 for Hind), headings 1.3 minimum (not the Latin 1.0–1.15) so matras and conjuncts don't clip. No uppercase overlines (Indic has no case): use `caption` at 700. Budget +60% length: chips wrap, buttons wrap to two lines, no fixed-width labels. Brand and platform names (WhatsApp, Instagram, AI, Reelkar) stay in Latin.
- **Arabic (RTL):** `dir="rtl"` on the document (web) / `I18nManager.forceRTL` (app). Fonts: Noto Sans Arabic for display and body (from the token stack), line height 1.6, no letter-spacing, no italics.
  - **Mirror:** reading order, text alignment, back chevrons and "next" arrows, list rows (icon on the right), chip rows, the share sheet order, the gift preview card and og image (cover on the right), step progress, the D8 approval row.
  - **Don't mirror:** play/pause and skip icons, the scrubber and buffered bar (time runs left to right), waveforms and the D8 part strip, timecodes (`0:42 / 1:48`), phone numbers, @handles, URLs, logos and the reel mark, the WhatsApp/Instagram glyphs. Wrap the player in `dir="ltr"`.
  - **Karaoke:** the fill runs in reading direction per word (right to left in Arabic) because highlighting is per word span, not a gradient across the line. Line-level fallback fills the whole line at once.
  - **Digits:** Western digits (`ar-AE` with `nu-latn`) for times, prices and counts, matching Gulf app norms. Owner may switch to Arabic-Indic.
  - **Mixed scripts:** names, handles and URLs inside bidi isolates.
  - Placeholder default country code +971 when the locale is `ar`.

## Accessibility

- Targets: 44 pt minimum everywhere (`tap-min` is 48 on app primary controls; play 56; Open your gift 56). Chips get `hitSlop` to 44.
- Contrast: `on-brand` on hero 6.5:1; Open your gift is `deep`/`on-deep` on the hero (13:1 text, button edge vs hero 6.5:1); `action`/`on-action` per tokens; karaoke sung-word fill `on-action` on `action` (4.6:1 light, 6.2:1 dark); upcoming `ink`, past `ink-muted` (both ≥ 4.5:1 on `surface-sunken`). D8 part bands carry labels.
- **Karaoke and screen readers:** the lyrics are a real list (`<ol aria-label="Lyrics">`), each line a `<li>`; the current line gets `aria-current="true"`; no `aria-live` on lyrics (announcing every line over music is noise). The player's play button announces "Play birthday song for Priya, 1 minute 48 seconds". A **Follow along** switch (on by default for sighted users) stops auto-scroll; VoiceOver users get a normal readable list. Word spans are `aria-hidden` duplicates of the line text, so each line reads once, whole.
- **Reduced motion:** reveal becomes a 150 ms fade, no petals, no cover scale, no auto-scroll smoothing (jump), `ReelLogo` static with a progress text.
- Font scale to 200%: gift page hero grows (min-height, not fixed height); app hero scrolls; buttons wrap.
- Focus: visible `focus-ring` on web; Esc closes sheets; the sign-up sheet traps focus and returns it to the Reply button.
- Never colour alone: status chips have icons + text; selected cover tile has a check badge; part bands have names.

## Edge cases

Gifts
- Recipient opens on a 2 GB Android in WhatsApp's in-app browser: page works without JS for sealed/playing basics (`<audio controls>` fallback inside `<noscript>`), total first load < 150 KB excluding audio.
- Recipient forwards the link to a family group: counts are per open (one per browser per day); the sender sees "Opened · 9 plays". That's expected; copy says plays, not people.
- Sender deletes the song: the gift link shows "removed"; replies stay (they are the replier's songs).
- Sender's account deleted: all their gift pages show "removed"; replies stay with their makers, thread link hidden.
- Song in sender's cloned voice, then the sender deletes that voice: the song (already made) keeps playing (consent covered making it); new songs in that voice are impossible.
- Recipient replies without installing the app: the web create flow takes the same prefill (web has `/create` and `/songs`).
- Several replies to one gift (family group): each is its own card in the thread, newest last.
- Occasion picked as Eid but song is in Hindi: fine; occasion just drives cover and copy.
- Very long names (e.g., "Chandrasekharan Venkataraman"): headline wraps; og image shrinks the name to fit two lines, then truncates with an ellipsis.

Jugalbandi
- B records but A cancels during joining: cancel is disabled while joining; after ready, either can remove their part.
- B has no Instagram connected: D5 asks for the handle (optional); without it, the post is a normal post crediting "with Sana on Reelkar" in the caption.
- B's Instagram is private or declines the collab: the post stays on A's profile only; Reelkar shows "Sana didn't accept the Instagram collab" on A's duet card. Nothing to retry.
- Instagram API rejects collaborators (account type, region): fall back to caption credit and tell A before posting ("Instagram won't add Sana as co-author on this account. We'll tag her in the caption instead.").
- Both record before either opens the app again: notifications batch; joining starts automatically when B taps Use this.
- B invited by @handle and also by WhatsApp link: same invite, same token.
- A invites themselves (second account on same phone): allowed; we don't police it.
- B's recording is very quiet or just talking: same Hum it analysis; "Asking" kind is allowed (AI writes and sings B's verse from what they said).
- Different languages (A sings Hindi, B Arabic): allowed; the AI keeps each part's language. A bilingual duet is a feature, not an error.

## Build notes

### Data

New tables (Drizzle, `src/lib/db/app-schema.ts`, then `npm run db:generate`):
- `share_link`: `id`, `token` (22-char random, unique), `kind` (`gift` | `duet_invite`), `ownerId`, `songId` or `duetId`, `createdAt`, `revokedAt`, `takenDownAt`. Lasting, revocable (PLAN 43 open item: this answers it with a table).
- `gift`: `id`, `shareLinkId`, `songId`, `senderId`, `toName`, `occasion` (enum), `note`, `coverKind` (`song` | `photo` | `ai`), `coverPath`, `ogImagePath`, `replyToGiftId` (nullable, self-ref), `openedAt`, `playCount`, `lastPlayedAt`.
- `gift_event`: `giftId`, `kind` (`open` | `play`), `day`, `visitorHash` (salted hash of a first-party cookie; never IP), unique on (`giftId`, `kind`, `day`, `visitorHash`), for dedup only, deleted after 30 days.
- `duet`: `id`, `starterId`, `partnerId` (nullable until accepted), `topic`, `genre`, `status` (`recording_a` | `inviting` | `waiting` | `recording_b` | `joining` | `review` | `posted` | `declined` | `expired` | `solo` | `cancelled`), `inviteExpiresAt`, `remindedAt`, `extendedAt`, `songId` (joined), `aApprovedAt`, `bApprovedAt`, `partnerIgHandle`, `heldStarter`, `heldPartner`.
- `duet_part`: `duetId`, `userId`, `takeId` (Hum it take), `voiceId` (nullable; must belong to `userId`), `retakes`.
- `report`: `id`, `shareLinkId`, `reason`, `details`, `email`, `createdAt`, `status`.
- `credit_hold`: `userId`, `amount`, `reason`, `refId`, `releasedAt`, `spentAt` (billing shows held separately).

### Endpoints

- `POST /api/songs/[id]/gift` → `{ giftId, url, ogImageUrl }`; `POST /api/gifts/[id]/cover` (AI cover); `DELETE /api/gifts/[id]/share` (stop sharing).
- `GET /g/[token]` server-rendered page (cacheable at the edge for 60 s; counts via `POST /api/g/[token]/event` from the page, so caching doesn't break counts). `GET /g/[token]/og.png`.
- Lyric timings: `GET /api/g/[token]/lyrics` → lines with `[start,end]` and optional word timings, from Whisper word timestamps on the vocal stem (the edit pipeline already uses Whisper word timings, decision 28); fallback: line times spread over the vocal sections.
- Audio: stream through the existing signed-URL path but signed per request by the page (short TTL), so the page link is lasting while audio URLs stay short-lived like `films/[id]/link`.
- `POST /api/duets`, `POST /api/duets/[id]/invite`, `POST /api/duets/[id]/accept|decline|remind|extend|solo|cancel|approve|retake-request`, `POST /api/duets/[id]/parts` (Hum it take id), worker job `duet-join` (BullMQ) that builds the song from both takes; `POST /api/posts` gets `collaborators: string[]`.
- Jobs: `duet-remind` at +24 h, `duet-expire` at +48 h (and +72 h if extended), `hold-release` at +7 days.
- Push: not in the app yet. Add `expo-notifications` and a `push_token` table; events: `gift.opened`, `gift.replied`, `duet.invited`, `duet.recorded`, `duet.ready`, `duet.retake`, `duet.expired`.

### What each screen needs

| Screen | Data |
|---|---|
| G2 | song (title, cover, voiceId owner, lyrics present), guessed occasion |
| G3 | gift url, message template per app language |
| G5/G7 | gifts by sender: toName, occasion, openedAt, playCount, lastPlayedAt, replies[] |
| R1 | public gift view: toName, fromName, occasion, note, cover, audio url (signed), duration, lyrics+timings, ownVoice flag, status |
| R3–R6 | gift token → sender display name, occasion; replier's voices; prices |
| D1 | genres, price (placeholder 6), balance |
| D4/D5 | duet, parts (A take url), partner profile, expiresAt, status, split offer |
| D8 | joined song, part ranges (for the strip), approvals |
| D9 | partner IG handle, A's connected accounts, captions |

### Reuse

- Hum it Record/Confirm/Making/Ready (`hum/*`) for every recording and the reply. New query params only: `gift`, `duet`, `part`.
- `songs/new` Simple mode for "Describe it" replies (prefill `topic`, `occasion`).
- `SongPlayerRow` / `useSongPlayer` for every in-app player; `SongCover` for covers.
- `reel/[id].tsx` "Post it" + "Caption" cards for D9 (extract them to `components/post-card.tsx` and `components/caption-card.tsx`, add `collaborators`).
- `(auth)/sign-in.tsx` + `otp.tsx` merged into a one-screen variant for R2 (keep the two-step version for normal sign-in), web `login/login-form.tsx` for the web join.
- `songs/video/[id]` for the optional music video.
- `(tabs)/inbox.tsx`: replace `ComingSoon` with a "Gifts and duets" list on top, keeping the comments coming-soon card below.
- Web gift page: new `src/app/g/[token]/page.tsx`, using `globals.css` tokens and the audio bits from `reel-player.tsx`.

## Open questions for the owner

1. **First reply free?** A new user's welcome credits cover one Hum it reply. Should replies to gifts be free (one per gift) to maximise the loop? My pick: yes, first reply free.
2. **Arabic name for Jugalbandi:** "دويتو" (my pick) or keep "Jugalbandi" everywhere as a brand word.
3. **Placeholder prices:** 6 credits per Jugalbandi (song 4 + tune 2), split 3/3, 1 free retake each. Confirm or set real numbers.
4. **Should the sender see the recipient's name as "Opened by Priya"?** I wrote "Opened · 2 plays" in the status and keep "Priya" in the card title, because we can't verify who opened it. Your brief's "Opened by Priya" reads as verified; confirm which you prefer.
5. **Deferred deep link for B without the app:** server-side token-on-account (my pick, no third party) vs a deep-link vendor (Branch/Adjust).
6. **Arabic-Indic vs Western digits** in the Arabic UI (I picked Western).
7. **Gift page domain:** `reelkar.app/g/…` assumed; short domain (e.g. `rlkr.in`) would make WhatsApp messages tidier.
8. **Arabic gendered address:** the gift page and message use the generic masculine imperative ("افتح هديتك"). Should the sender pick the recipient's gender in Arabic so the page can say "افتحي هديتك"? My pick: add it as an optional Arabic-only chip on the gift step later, not in v1.
