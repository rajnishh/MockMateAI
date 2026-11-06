# Community 4: Remix chains with credit

Status: design spec v1, 2026-11-06. Not built. Follows PLAN.md decision 43 item 4 ("A song published as remixable can be covered, extended or rapped over. Each remix shows its family tree, and the original maker gets a share of the credits every remix spends"), decision 42 (prices) and decision 44 (Listen phase 1, built: public songs, `@handles`, `/s/{publicId}`, Allow remixes, a cover-only remix of someone's public song, the "A remix of X by @y" credit line).
Design system: v3.0 Masala Pop (`design/v3.0/tokens.json`), token names as in `design/community/flow-spec.md`.
Mockups: `design/community/remix-mockups.html` (clickable iPhone screens; the web song page's Remixes section at desktop and phone width; light/dark; English, Hindi, Arabic; reduced motion).
Shared with: reel recipes (`design/community/recipes-spec.md`, designed in parallel). Both features use **one earnings model**: one ledger reason (`earning`), one `creator_earning` table, one **Earnings** screen. See "Earnings (shared with recipes)".

---

## Frame

- **Goal:** a creator hears a public song they like and makes it their own (a cover, a longer version, a rap over it) in under a minute, and the person who made it is credited forever and earns from it.
- **One job per screen:** song page = listen and see the family; Remix = pick what to make, see the price, make it; family tree = see where a song came from and where it went; Earnings = see what my songs earned.
- **Success metrics (first 30 days after launch):** 8% of song page views by signed-in listeners tap Remix; 50% of those finish a remix; 30% of finished remixes get published; 20% of creators with a public song see at least one remix; under 1 report per 200 remixes.

## Decisions in one place

| Topic | Decision | Why, in one line |
|---|---|---|
| Kinds open on someone else's song | **Cover**, **Extend**, **Rap over it** (1 credit each). When the pro lane (Runware) is on: **New words** (`add-vocals`) and **New beat** (`add-instrumental`), 6 credits each. | These add to the song or re-sing it; the credit line stays true. |
| Kind never open on someone else's song | **Replace part** (`replace`) | It rewrites lines inside their song while the page still says "by @them", which puts words in their mouth. Rap over it is clearly a new voice, so it stays. |
| Voice rule | Remixes are sung by AI singers only (the remix engine takes no voice). A song in anyone's cloned voice can't be remixed. The remixer may later make "Sing in my voice" of **their own** remix with **their own** consented voice; that version then can't be remixed either. The original creator's voice is never offered to anyone else. | PLAN 43: consent in item 15 covers only the voice's owner. |
| Chains | Remixes of remixes are allowed, with no depth limit. Every remix has its own Allow remixes switch, on by default. | That's the "chain"; limiting depth adds rules nobody asked for. |
| Who earns | **The maker of the song you remixed** (the direct parent), never yourself. | The remixer sees exactly one person on the Remix screen; "@sana earns from this" is a promise they can check. |
| How much | **10% (placeholder) of the paid credits** the remix spends, paid as credits. | PLAN 43. |
| Paid vs free | **In proportion**, the same rule as reel recipes: `ratio = paidIn / (paidIn + freeIn)` over the payer's lifetime ledger (paid = `purchase`, `subscription`; free = `grant`, `earning`), taken when the remix is charged and saved on the earning row. No balance buckets, no spend order. | Shared with recipes; one sum query; no migration that splits balances. |
| When it's granted | When the remix **finishes successfully**. A failed remix is refunded and earns nothing. A granted earning is never taken back. | Earn on value delivered, keep it simple. |
| Small amounts | Earnings are kept in **hundredths** of a credit (recipes' spec says tenths; hundredths are needed here, since a 1-credit remix with an 80% paid ratio earns 0.08, which tenths would round to 0). Whole credits are added to the balance as soon as they add up; the rest shows as "on the way". | A 1-credit remix earns 0.1 credit; balances stay whole numbers. |
| Turning off Allow remixes | Stops new remixes of **that song** only. Remixes already made stay up, with credit. Remixes of those remixes follow their own makers' switches. | Matches Suno and decision 44.6; no one loses a song they made. |
| Family tree | A **Remixes** section on every song page (app and web) and a full **Family tree** screen. | Visible where people already are; one deeper screen for the curious. |
| Hidden nodes | Private remixes are never shown or counted publicly. A taken-down, private or deleted song in the **middle** of a chain shows as a grey "No longer available" node so its public remixes stay attached. Hidden leaves are left out. | Truthful counts, no broken chains, no leaks. |
| Web | The web song page gets the Remixes section and the family tree. **Remix** on the web opens the existing web Song Studio remix panel (signed in) with the song loaded. | `src/app/songs/remix-panel.tsx` exists; no need to push people to the app. |

---

## Flows

### A. Remix someone else's song (iPhone; web is the same steps)

```
Listen / any rail / shared link
  └─ Song page  s/[id]   (web /s/{publicId})
        ├─ Remixes section: path to the original, top remixes, "See the family tree"
        └─ Remix  (hidden if: your own song, remixes off, own-voice song, taken down)
              └─ Remix screen  listen/remix/[id]
                    Header card: "Remixing 'Pind Di Kudi' by @harjot.beats" + player
                    Pick one:  Cover 1 · Extend 1 · Rap over it 1  [· New words 6 · New beat 6]
                    Kind options (StudioRemix as today)
                    Credit card: "Credit goes to @harjot.beats. They earn a share of what you spend."
                    Primary: "Make cover · 1 credit"
                        ├─ not enough credits → Banner + Get credits (nothing charged)
                        ├─ safety check fails → inline error, nothing charged
                        ├─ maker turned remixes off meanwhile → Banner, Back to the song
                        └─ OK → Song Studio songs/[id] (making state, as today)
                                  ├─ fails → refund (shown), no earning
                                  └─ ready → "Share on Listen" card, credit line preview locked
                                             └─ Publish sheet (songs/publish/[id])
                                                   credit line shown, can't be removed
                                                   Allow remixes [on]
                                                   └─ public → original maker's Inbox: "@sana.sings published a cover of Pind Di Kudi"
```

### B. Original maker (earns and decides)

```
Remix finishes (any remixer, private or public)
  └─ creator_earning: pending → earned; whole credits added to the balance
        └─ Inbox item  (private remix: "Someone made a cover of Pind Di Kudi · +0.1 credit")
                       (published:     "@sana.sings published a cover of Pind Di Kudi" → their song page)
        └─ Push, at most one a day per song: "3 new remixes of Pind Di Kudi"
Own song page s/[id] (mine)
  └─ "Remixes" card: 23 remixes · you earned 2.3 credits → Earnings
  └─ Allow remixes switch → off → sheet "Stop new remixes?" → Stop new remixes
Account › Earnings  /  Credits › Earned  →  Earnings screen (remixes + recipes)
```

### C. Family tree

```
Song page › Remixes section › "See the family tree"  →  s/[id]/family  (web /s/{publicId}/family)
  Original at the top, then each remix under the song it came from.
  This song is highlighted. Sort: Top | Newest. Tap any node → its song page.
```

### States covered

| Where | Empty | Loading | Error | Offline | Success |
|---|---|---|---|---|---|
| Remixes section | "No remixes yet. Be the first." + Remix (if allowed) | 3 skeleton rows | "Couldn't load remixes. Try again" (inline retry) | Section hidden; song still plays if cached | rows |
| Remix screen | n/a | header card skeleton + kind chips skeleton | Banner with the server's message | "You're offline. Connect to make a remix." Primary disabled | → Song Studio |
| Family tree | Only the original: "No remixes yet." | skeleton outline | retry | cached last tree, "Showing saved tree" | tree |
| Earnings | "Nothing earned yet. When people remix your public songs or use your recipes, it shows here." + "Share a song on Listen" | skeleton | retry | last saved totals, "Updated 2 h ago" | list |

---

## Screens (iPhone)

| # | Screen | Route | Reuses | New or changed |
|---|---|---|---|---|
| X1 | Song page with Remixes section | `s/[id]` | existing screen, `SongRail`, `ListRow`, `SongCover` | new `RemixFamily` section; Remix button stays |
| X2 | Remix: pick a kind | `listen/remix/[id]` | existing screen, `StudioRemix` | kinds beyond cover; header card; credit card |
| X3 | Rap over it options | same screen | `StudioRemix` part picker, `Waveform`, bars field | label "Rap over it" |
| X4 | Remix not possible | same screen | `Banner` | remixes off / own voice / too long / offline |
| X5 | Not enough credits | same screen | `Banner` + Get credits (as today) | — |
| X6 | Making → ready, Share on Listen | `songs/[id]` | existing making + Share on Listen card | locked credit line preview |
| X7 | Publish a remix | `songs/publish/[id]` | existing publish sheet | credit row (locked), "Remixes of remixes" note |
| X8 | Family tree | `s/[id]/family` (new) | `Screen`, `Header`, `ChipRow`, `SongCover` | new `FamilyTree` outline |
| X9 | Own song page: remixes + control | `s/[id]` (mine) | existing "Your song" card, `Switch` | remix stats, Allow remixes switch, link to Earnings |
| X10 | Stop new remixes? (sheet) | same | sheet pattern from report sheet | — |
| X11 | Inbox items | `(tabs)/inbox` | gifts and duets list | two new item kinds |
| X12 | Push | n/a | `src/lib/push.ts` | new push kind `remixes` |
| X13 | Earnings (shared with recipes) | `earn` (today's placeholder, replaced) | `Screen`, `Hero`, `ChipRow`, `ListRow`, `Credits` | new |
| X14 | Earnings detail for one song | `earn/[ref]` (new) | `ListRow` | new |
| X15 | How earning works (sheet) | from X13 | sheet | new |

### X1. Song page: Remixes section

Placed after Lyrics, before More like this (people who scrolled past the lyrics are the ones ready to make something).

1. **Where it came from** (only if this song is a remix): a small vertical path, oldest at the top.
   - `Original` row: tiny cover 40, title, `@handle`, pill "Original".
   - Middle rows (if any), each with a kind pill ("Cover", "Extended", "Rap").
   - The current song, bold, "This song".
   - If the path has more than 3 songs above this one, show Original, a "2 more" row (tap opens the family tree) and the direct parent.
   - The credit line from Listen phase 1 stays under the title at the top ("A remix of 'Pind Di Kudi' by @harjot.beats"); the path is the detail.
2. **Remixes of this song · {n}**: up to 3 rows (cover 48, title, `@handle`, kind pill, plays, and "{k} remixes" if it has its own). Sort: Top (plays in the last 30 days + likes) by default. Only public remixes are listed; "No longer available" nodes appear only in the family tree.
3. Footer row: **See the family tree · {total} songs** (total = every public song in the family, this one included) → X8.
4. Empty: "No remixes yet. Be the first." (with the Remix button right there, secondary, because Play is the page's primary).
5. Remixes off: caption "@harjot.beats has turned off new remixes." The list of existing remixes stays.

The Remix button in the action row (existing) keeps its place and label. It's the page's second button after Play; Remix is `secondary`.

### X2. Remix: pick a kind

- `Header` "Remix", sub "Pind Di Kudi · @harjot.beats".
- **Header card** (`deep` surface): cover 64, "Remixing", title, `@handle`, a small play button (the original plays in the shared player).
- **What do you want to make?** Chips (one row, wraps):
  - Cover · 1 — "Sing it again in another style."
  - Extend · 1 — "Make it longer. Write the new lines."
  - Rap over it · 1 — "Pick a part. AI writes the bars, or you do."
  - New words · 6 — "Your words on this music." (pro lane only)
  - New beat · 6 — "New music under these vocals." (pro lane only)
  Each chip reads "Cover, 1 credit" to screen readers.
- Kind options: exactly what `StudioRemix` shows today (style + Enhance style + Close to the original / In between / A whole new take for Cover; 15/30/60 s for Extend; part picker + bars for Rap).
- **Credit card** (`teal-tint`): icon, "Credit goes to @harjot.beats", caption "Your remix says 'A remix of Pind Di Kudi by @harjot.beats'. They earn a share of the credits you spend." Link "How earning works" → X15.
- Voice caption under the card (only when the remixer has a cloned voice): "Remixes use AI singers. You can make a version in your own voice after."
- **Sticky footer:** primary "Make cover · 1 credit" (verb + kind + price; changes with the kind); caption "You have 37 credits. Nothing is charged if it fails."

### X3. Rap over it

Same screen, Rap chip on. Waveform with the part handles (3–60 s), "Play part", "What's the rap about? (optional)", "Write rap bars" (`tweak`), the bars field. Primary "Make rap · 1 credit", disabled until bars are 10+ characters, with the reason as caption ("Write the bars or let AI write them").

### X4. Remix not possible

One `Banner` in place of the kinds, plus "Back to the song":
- Remixes off: "@harjot.beats has turned off remixes for this song."
- Own voice: "This song is sung in @harjot.beats's own voice, so it can't be remixed."
- Too long: "This song is longer than 4 minutes, so it can't be remixed." (Extend alone hides when the result would pass 4 minutes: chip disabled with "Too long to extend".)
- Taken down / private meanwhile: "This song isn't public any more."
- Offline: "You're offline. Connect to make a remix." (kinds stay visible; primary disabled).

### X5. Not enough credits

As today: `Banner` "Not enough credits. Make cover costs 1 credit and you have 0." + Get credits. Nothing charged.

### X6. Making → ready

Existing Song Studio making state. When ready, the **Share on Listen** card shows the credit line it will carry ("A remix of 'Pind Di Kudi' by @harjot.beats", lock icon). If it failed: the existing failure banner plus "1 credit is back in your balance."

### X7. Publish a remix

Existing publish sheet with one new read-only row at the top: lock icon, "Credit: A remix of 'Pind Di Kudi' by @harjot.beats", caption "This stays on your song." The Allow remixes switch keeps its copy: "Others can make a cover or remix. You're always credited." No other change.

### X8. Family tree

- `Header` "Family tree", sub "Pind Di Kudi · 24 songs".
- `ChipRow`: **Top** | **Newest**.
- **Outline**, not a graph (reads at a glance, scrolls, works with font scale 200% and RTL):
  - Root at the top, a full-width card: cover 56, title, `@handle`, pill "Original", plays.
  - Each child indented 20 pt under its parent, with a 2 pt `line-strong` rail on the leading edge and a short elbow to each row. Kind pill on every row.
  - Indent stops growing after level 3; deeper rows carry a "Level 5" caption instead, so names never squeeze.
  - Each parent shows its first 3 children (by the sort), then "Show 8 more" (loads that branch).
  - The song you came from is highlighted (`teal-tint` background, "This song").
  - "No longer available" node: grey dashed card, no cover, no title, no handle, caption "Removed or made private"; not tappable; its public children stay attached below.
- Counts in the header count public songs only.
- Tap a row → its song page.

### X9. Own song page: remixes and control

The existing "Your song" card gains:
- "23 remixes · 4 published" (published = public remixes; the other number counts private ones without names).
- "You earned 2.3 credits from remixes" → X13.
- `Switch` **Allow remixes** with caption "Others can make a cover or remix. You're always credited." Turning it off opens X10. Turning it on applies at once with a `Win` toast "New remixes are on".
- Own-voice song: switch hidden, caption "Songs in your own voice can't be remixed." (existing copy).

### X10. Stop new remixes? (sheet)

Title "Stop new remixes?". Body: "People won't be able to remix Pind Di Kudi from now on. The 23 remixes already made stay up, with credit to you." Primary (`action`) "Stop new remixes"; ghost "Keep remixes on". No second confirmation.

### X11. Inbox items

Under "Gifts and duets", a new group **Remixes** (same `ListRow`):
- Published remix: avatar initial, "@sana.sings published a cover of Pind Di Kudi", sub "2 h ago · +0.1 credit" → that remix's song page.
- Private remix (not published, or never): coin icon, "Someone made a cover of Pind Di Kudi", sub "+0.1 credit" → Earnings detail. No name: the remixer hasn't shared it.
- Batched when more than 3 in a day: "5 new remixes of Pind Di Kudi · +0.5 credit" → Earnings detail.
- Remix that earned nothing (paid with free credits): same row, sub without the amount. We don't say "0".

### X12. Push

New push kind `remixes` in Notifications settings ("Remixes and earnings", on by default). At most one a day per song: "Your song is being remixed" / "3 new remixes of Pind Di Kudi. You earned 0.3 credit." Path → X14. A new whole credit doesn't get its own push.

### X13. Earnings (shared with reel recipes)

Route `earn.tsx` (today's Earn placeholder becomes this screen, as the recipes spec proposes), linked from Account › Earn, from the Credits screen (a row "Earned from remixes and recipes · 2.3"), from X9 and from Inbox items.

- `Header` "Earnings".
- `Hero` (saffron): overline "You've earned", big number "2.3 credits", sub "2 added to your balance · 0.3 on the way".
- `ChipRow`: **All** | **Remixes** | **Recipes** (Recipes chip only once recipes ship; it's the same screen).
- List by song or recipe, highest first: cover, title, "18 remixes" or "41 uses", amount "+1.8". Tap → X14.
- Card "How earning works" → X15.
- Caption at the bottom: "Earned credits work like any credits. They can't be cashed out yet."
- Empty state: see States table.

### X14. Earnings detail

`Header` title = song or recipe name. Rows newest first: "Cover by @sana.sings · 2 Nov · +0.1", "A private remix · 1 Nov · +0.1", "Rap by @dj.roohi · 31 Oct · +0.1", rows that earned nothing show "Free credits, nothing earned" in `ink-muted`. "Load more" at 50.

### X15. How earning works (sheet)

- "When someone remixes your public song, or makes a reel with your recipe, you get 10% of the credits they paid for."
- "Free credits, like your welcome credits, don't count."
- "You earn when their remix or reel is made. If it fails, they get their credits back and nothing is earned."
- "You never earn from your own songs or recipes."
- "Small amounts add up: every 1.0 goes into your balance."
- "Earned credits can't be cashed out yet."
Button "Got it". The 10% comes from the API (`earnShare`), never hard-coded.

---

## Web: song page Remixes section (`/s/{publicId}`)

- Same content as X1, in the page's single column on phone width; on desktop (≥ 960 px) the song page becomes two columns: player, actions and lyrics on the left (as today), **Remixes** in a right column (360 px) that is sticky under the header. The path "Where it came from" sits above "Remixes of this song".
- **Remix** button: signed in → `/songs?remixOf={publicId}` (the web Song Studio remix panel with the original loaded and kinds limited as on X2); signed out → the existing login with `next` back to the same panel. Signed-out visitors still see the whole section and tree.
- **Family tree** link → `/s/{publicId}/family` (same outline as X8, server-rendered, works without JS: every node is a plain link; "Show 8 more" is a link to `?branch={id}`).
- Report stays in the footer of the song page and the family page (both are public pages).
- "Made with AI" stays on the page; each tree row doesn't repeat it (it's every song on Reelkar).
- Caching: the section comes from the same server render as the page; counts may be up to 60 s old.

---

## Copy (English · Hindi · Arabic)

ICU message format. Handles, titles and URLs in bidi isolates (`<bdi>` web, `⁨…⁩` in RN). Kind names are short nouns so they survive +60% length. Credit amounts use the locale's number format with one decimal (`0.1`, Arabic-Indic `٠٫١` when the phone uses those digits).

| Key | English | Hindi | Arabic |
|---|---|---|---|
| `remix.section` | Remixes | रीमिक्स | ريمكسات |
| `remix.count` | {n, plural, one {# remix} other {# remixes}} | {n} रीमिक्स | {n, plural, zero {لا ريمكسات} one {ريمكس واحد} two {ريمكسان} few {# ريمكسات} many {# ريمكسًا} other {# ريمكس}} |
| `remix.ofThis` | Remixes of this song | इस गाने के रीमिक्स | ريمكسات هذه الأغنية |
| `remix.cameFrom` | Where it came from | यह कहाँ से आया | من أين جاءت |
| `remix.original` | Original | ओरिजिनल | الأصلية |
| `remix.thisSong` | This song | यह गाना | هذه الأغنية |
| `remix.empty` | No remixes yet. Be the first. | अभी कोई रीमिक्स नहीं। पहला आप बनाइए। | لا ريمكسات بعد. كن أول من يصنع واحدًا. |
| `remix.tree` | See the family tree · {n} songs | पूरा परिवार देखें · {n} गाने | شاهد شجرة العائلة · {n} أغانٍ |
| `remix.treeTitle` | Family tree | रीमिक्स परिवार | شجرة العائلة |
| `remix.gone` | No longer available | अब उपलब्ध नहीं | لم تعد متاحة |
| `remix.goneSub` | Removed or made private | हटाया गया या प्राइवेट किया गया | أُزيلت أو صارت خاصة |
| `remix.showMore` | Show {n} more | {n} और दिखाएँ | اعرض {n} أخرى |
| `remix.sort.top` | Top | टॉप | الأكثر |
| `remix.sort.new` | Newest | नए | الأحدث |
| `remix.off` | {handle} has turned off new remixes. | {handle} ने नए रीमिक्स बंद कर दिए हैं। | أوقف {handle} الريمكسات الجديدة. |
| `remix.header` | Remixing | रीमिक्स कर रहे हैं | ريمكس لأغنية |
| `remix.pick` | What do you want to make? | आप क्या बनाना चाहते हैं? | ماذا تريد أن تصنع؟ |
| `remix.kind.cover` | Cover | कवर | غلاف |
| `remix.kind.extend` | Extend | लंबा करें | إطالة |
| `remix.kind.rap` | Rap over it | इस पर रैप | راب عليها |
| `remix.kind.words` | New words | नए बोल | كلمات جديدة |
| `remix.kind.beat` | New beat | नया संगीत | لحن جديد |
| `remix.pill.cover` | Cover | कवर | غلاف |
| `remix.pill.extend` | Extended | लंबा किया | مُطوَّلة |
| `remix.pill.rap` | Rap | रैप | راب |
| `remix.make` | Make {kind} · {n, plural, one {# credit} other {# credits}} | {kind} बनाएँ · {n} क्रेडिट | اصنع {kind} · {n} رصيد |
| `remix.creditTo` | Credit goes to {handle} | श्रेय {handle} को मिलेगा | الفضل لـ {handle} |
| `remix.creditBody` | Your remix says "A remix of {title} by {handle}". They earn a share of the credits you spend. | आपके रीमिक्स पर लिखा होगा "{handle} के {title} का रीमिक्स"। आप जो क्रेडिट खर्च करेंगे, उसका एक हिस्सा उन्हें मिलेगा। | سيظهر على الريمكس "ريمكس لأغنية {title} من {handle}". سيحصل على جزء من الرصيد الذي تنفقه. |
| `remix.voiceNote` | Remixes use AI singers. You can make a version in your own voice after. | रीमिक्स AI गायक गाते हैं। बाद में आप अपनी आवाज़ में भी बना सकते हैं। | يغني الريمكس مغنٍّ بالذكاء الاصطناعي. يمكنك صنع نسخة بصوتك بعد ذلك. |
| `remix.noCharge` | You have {n} credits. Nothing is charged if it fails. | आपके पास {n} क्रेडिट हैं। फ़ेल होने पर कुछ नहीं कटेगा। | لديك {n} رصيد. لن يُخصم شيء إن فشل. |
| `remix.notAllowed` | {handle} has turned off remixes for this song. | {handle} ने इस गाने के रीमिक्स बंद किए हैं। | أوقف {handle} الريمكس لهذه الأغنية. |
| `remix.ownVoice` | This song is sung in {handle}'s own voice, so it can't be remixed. | यह गाना {handle} की अपनी आवाज़ में है, इसलिए इसका रीमिक्स नहीं बन सकता। | هذه الأغنية بصوت {handle} الحقيقي، لذا لا يمكن عمل ريمكس لها. |
| `remix.tooLong` | This song is longer than 4 minutes, so it can't be remixed. | यह गाना 4 मिनट से लंबा है, इसलिए रीमिक्स नहीं बन सकता। | هذه الأغنية أطول من 4 دقائق، لذا لا يمكن عمل ريمكس لها. |
| `remix.offline` | You're offline. Connect to make a remix. | आप ऑफ़लाइन हैं। रीमिक्स बनाने के लिए इंटरनेट चालू करें। | أنت غير متصل. اتصل بالإنترنت لصنع ريمكس. |
| `remix.refund` | {n} credit is back in your balance. | {n} क्रेडिट वापस आ गया। | أُعيد {n} رصيد إلى حسابك. |
| `remix.lockedCredit` | Credit: A remix of {title} by {handle} | श्रेय: {handle} के {title} का रीमिक्स | الفضل: ريمكس لأغنية {title} من {handle} |
| `remix.lockedSub` | This stays on your song. | यह आपके गाने पर हमेशा रहेगा। | يبقى هذا على أغنيتك. |
| `remix.stop.title` | Stop new remixes? | नए रीमिक्स बंद करें? | إيقاف الريمكسات الجديدة؟ |
| `remix.stop.body` | People won't be able to remix {title} from now on. The {n} remixes already made stay up, with credit to you. | अब से कोई {title} का रीमिक्स नहीं बना पाएगा। पहले बने {n} रीमिक्स बने रहेंगे, आपके श्रेय के साथ। | لن يتمكن أحد من عمل ريمكس لـ {title} من الآن. تبقى الريمكسات الـ{n} الموجودة، مع ذكر اسمك. |
| `remix.stop.yes` | Stop new remixes | नए रीमिक्स बंद करें | أوقف الريمكسات الجديدة |
| `remix.stop.no` | Keep remixes on | रीमिक्स चालू रखें | أبقِ الريمكس متاحًا |
| `inbox.remixPublished` | {handle} published a {kind} of {title} | {handle} ने {title} का {kind} शेयर किया | نشر {handle} {kind} لأغنية {title} |
| `inbox.remixPrivate` | Someone made a {kind} of {title} | किसी ने {title} का {kind} बनाया | صنع أحدهم {kind} لأغنية {title} |
| `inbox.remixBatch` | {n} new remixes of {title} | {title} के {n} नए रीमिक्स | {n} ريمكسات جديدة لأغنية {title} |
| `push.remix` | {n} new remixes of {title}. You earned {amount} credit. | {title} के {n} नए रीमिक्स। आपने {amount} क्रेडिट कमाए। | {n} ريمكسات جديدة لأغنية {title}. ربحت {amount} رصيد. |
| `earn.title` | Earnings | कमाई | الأرباح |
| `earn.total` | You've earned | आपने कमाए | ربحت |
| `earn.credits` | {amount} credits | {amount} क्रेडिट | {amount} رصيد |
| `earn.split` | {whole} added to your balance · {rest} on the way | {whole} आपके बैलेंस में जुड़े · {rest} और आने वाले | أُضيف {whole} إلى رصيدك · {rest} في الطريق |
| `earn.chip.all` | All | सब | الكل |
| `earn.chip.remixes` | Remixes | रीमिक्स | ريمكسات |
| `earn.chip.recipes` | Recipes | रेसिपी | وصفات |
| `earn.how` | How earning works | कमाई कैसे होती है | كيف تربح |
| `earn.how.1` | When someone remixes your public song, or makes a reel with your recipe, you get {pct}% of the credits they paid for. | जब कोई आपके पब्लिक गाने का रीमिक्स बनाता है, या आपकी रेसिपी से रील बनाता है, तो उनके ख़रीदे क्रेडिट का {pct}% आपको मिलता है। | عندما يصنع أحدهم ريمكس لأغنيتك العامة، أو فيديو بوصفتك، تحصل على {pct}٪ من الرصيد الذي دفع ثمنه. |
| `earn.how.2` | Free credits, like your welcome credits, don't count. | मुफ़्त क्रेडिट, जैसे वेलकम क्रेडिट, नहीं गिने जाते। | الرصيد المجاني، مثل رصيد الترحيب، لا يُحتسب. |
| `earn.how.3` | You earn when their remix or reel is made. If it fails, nothing is earned. | उनका रीमिक्स या रील बनते ही आपकी कमाई होती है। फ़ेल हुआ तो कुछ नहीं। | تربح عندما يكتمل الريمكس أو الفيديو. إن فشل، لا ربح. |
| `earn.how.4` | You never earn from your own songs or recipes. | अपने ही गानों या रेसिपी से कमाई नहीं होती। | لا تربح من أغانيك أو وصفاتك أنت. |
| `earn.how.5` | Small amounts add up: every 1.0 goes into your balance. | छोटी रक़म जुड़ती रहती है: हर 1.0 आपके बैलेंस में जाता है। | المبالغ الصغيرة تتجمع: كل ١٫٠ يُضاف إلى رصيدك. |
| `earn.noCash` | Earned credits work like any credits. They can't be cashed out yet. | कमाए क्रेडिट बाक़ी क्रेडिट की तरह चलते हैं। अभी इन्हें कैश नहीं किया जा सकता। | الرصيد الذي تربحه يعمل كأي رصيد. لا يمكن صرفه نقدًا حاليًا. |
| `earn.empty` | Nothing earned yet. When people remix your public songs or use your recipes, it shows here. | अभी कोई कमाई नहीं। जब लोग आपके पब्लिक गानों का रीमिक्स बनाएँगे या आपकी रेसिपी इस्तेमाल करेंगे, वह यहाँ दिखेगा। | لا أرباح بعد. عندما يصنع الناس ريمكس لأغانيك العامة أو يستخدمون وصفاتك، ستظهر هنا. |
| `earn.free` | Free credits, nothing earned | मुफ़्त क्रेडिट, कोई कमाई नहीं | رصيد مجاني، بلا ربح |
| `earn.privateRemix` | A private remix | एक प्राइवेट रीमिक्स | ريمكس خاص |

English-only strings (screen readers, captions) follow the same voice: "Cover, 1 credit", "Family tree, 24 songs", "Level 5", "Show 8 more remixes of Mitti Ki Khushboo".

### Language rules (in addition to `design/community/flow-spec.md`)

- **Hindi:** "रीमिक्स", "कवर", "रैप", "क्रेडिट" stay as loanwords (that's how creators say them). Kind pills wrap; never fixed width. Line height 1.6 body, 1.3 headings.
- **Arabic (RTL):**
  - Mirror: the whole song page, the path list, the family tree outline (indent and rail move to the right edge, elbows point left), chip order, the credit card (icon on the right), Earnings rows (amount on the left).
  - Don't mirror: play buttons, the waveform and part picker for Rap over it (time runs left to right; wrap in `dir="ltr"`), timecodes, `@handles`, the `+0.1` amount's sign position (format with `Intl.NumberFormat(locale, { signDisplay: "always" })`, which places it correctly).
  - Kind names: "غلاف" for cover is the common Gulf term for a cover song; keep "ريمكس" as the umbrella word.
  - Neutral address on buttons ("اصنع" is the imperative; acceptable in Gulf app copy; the gift spec's verbal-noun rule applies to recipient pages, not the creator's own screens).

---

## Edge cases

Remixing
- Maker turns off Allow remixes while someone is on X2: Make returns 403; X4 banner "…has turned off remixes for this song." Nothing charged.
- Maker turns it off while a remix is making: the remix finishes and is credited; earning is still granted (it started while allowed).
- Song becomes private or is taken down while a remix is making: the remix finishes (the remixer paid for it), keeps its credit link, and shows "A remix of a song that's no longer public". **Earning is dropped if the parent was taken down** (a report was upheld), kept if it was only made private.
- Remix of your own public song: allowed with every kind (it's your Song Studio), linked in the family tree, earns nothing.
- Remix of your own remix of someone else's song: earns nothing (the parent is yours). The grandparent doesn't earn either; you already paid them once.
- Two accounts farming each other: every earning costs the payer 10× what it pays, in paid credits; no loss to Reelkar.
- Remixing a song in a cloned voice: Remix hidden; API refuses (`voiceProfileId` set). A "Sing in my voice" version of a remix is a new song in the remixer's voice: can be published by them, labelled "Sung in @handle's own voice", can't be remixed.
- Extend near the limit: Extend chip disabled with "Too long to extend" when `duration + 15 s > 240 s`; Cover and Rap stay.
- A remix's title: today's suffix ("Pind Di Kudi (cover)") stays; the remixer can rename at publish. The credit line always uses the parent's current public title.
- Parent's maker changes their handle: credit lines read the handle live; old handles are not stored on the remix.
- Remixer's credit was split between free and paid (e.g., 6-credit New beat with 2 free + 4 paid): earning is on the 4 paid (0.4).
- Refund after failure returns the whole charge as today (`refund`); refunds are left out of the ratio.
- Very long chains (depth 30): the path shows Original, "28 more", parent, this; the tree caps indent at level 3 and lazy-loads branches.
- Huge families (5,000 remixes): Remixes section shows the top 3; family tree loads the first 3 children per node, then "Show more" per branch; the header count is a counter, not a live count.

Family tree
- A remix in the middle is deleted by its maker: its row in `remix_link` cascades away with the song, so its children's `parent_song_id` points at a song that no longer exists; the API returns that id as a "No longer available" node (children keep `root_song_id`, so they stay in the family).
- Root deleted: the tree renders with a "No longer available" root; remixes keep "A remix of a song that's no longer public".
- A private remix with public children (published, then made private): shown as a "No longer available" node.
- Reported songs stay visible until taken down (decision 44.7).

Earnings
- Earner deletes their account: pending earnings are dropped; remixes stay with their makers.
- Earner has no handle (impossible: a public song needs one).
- Share percentage changes later: each `creator_earning` row stores what it earned at the time; new rows use the new rate.
- Remixer is refunded later by support for a finished remix: the earning stays (we never claw back); support notes it.
- Monthly plan credits expire: no effect on earnings; the ratio uses credits that came in, not what's left.

---

## Accessibility

- Targets: every row 56+ pt tall; kind chips 44+ (`hitSlop`); Make 52; switch row 52.
- Contrast: kind pills use `chip`/`ink` (8:1+); "This song" highlight is `teal-tint` with `teal-text` label "This song" (text, not colour alone); the "No longer available" node uses a dashed `line-strong` border plus text; amounts `+0.1` in `ink` with a coin icon, never green alone.
- Family tree for screen readers: a nested list (`<ul role="tree">` on web with `aria-level`, `aria-setsize`, `aria-posinset`; in RN a flat `FlatList` whose rows announce "Cover by @sana.sings, level 2, remix of Pind Di Kudi, 3 remixes"). "Show 8 more" is a button with the parent's name in its label.
- Path list: "Where it came from: Original, Pind Di Kudi by @harjot.beats; Cover by @sana.sings; This song."
- Font scale 200%: rows grow; kind pills move under the title; indent capped at level 3 so text keeps width; the web right column drops under the player below 960 px.
- Reduced motion: no tree expand animation (rows appear), no hero count-up on Earnings, no chip slide.
- RTL: tree rail and indent on the right; VoiceOver order follows reading order.

---

## Build notes

### Data (one migration; edit `src/lib/db/app-schema.ts`, then `npm run db:generate`)

1. **`remix_link`** (the family tree; survives deletions in the middle):
   - `child_song_id` uuid PK → `song.id` on delete cascade
   - `parent_song_id` uuid not null, **no FK** (so a deleted parent becomes a "No longer available" node)
   - `parent_user_id` text (who made the parent at remix time; for earnings and Inbox)
   - `root_song_id` uuid not null, no FK (the parent's root, or the parent if it has none)
   - `depth` int (parent's depth + 1)
   - `kind` text enum (`remix_kind`: the six `REMIX_KINDS`)
   - `created_at`
   - Indexes: (`parent_song_id`), (`root_song_id`).
   - Written for **every** remix (own songs too). Backfill from today's remixes: songs whose `parent_song_id` is set and whose `voice_profile_id` is null (my-voice versions keep `parent_song_id` only and are not remixes). Kind for old rows: from the title suffix, else `cover`.
   - `listen.ts` `remixOf` reads `remix_link` instead of `parentSongId`.
2. **`song.remix_count`** int default 0: public direct remixes, kept by publish/unpublish/take-down of the child (for sorting and the section count). Family size = `count(*) from remix_link join song where root_song_id = ? and public` (indexed; cache 60 s).
3. **Credits**
   - No balance split. `paidRatio(userId)` = Σ positive `delta` with reason `purchase`/`subscription` ÷ Σ positive `delta` with reason `purchase`/`subscription`/`grant`/`earning` (0 when both are 0; refunds left out). Same function for recipes.
   - `ledger_reason` gets **`earning`**.
   - Earned credits count as free in the ratio, so spending them never earns again (no loops).
4. **`creator_earning`** (shared with recipes):
   - `id` uuid PK, `user_id` (earner), `source` enum `remix | recipe`, `source_ref` (the child song id or the reel id), `subject_ref` (parent song id or recipe id), `payer_user_id`, `charged` int, `paid_ratio_bp` int (ratio at charge time, basis points), `rate_bp` int (basis points, 1000 = 10%), `hundredths` int (`floor(charged × paid_ratio_bp × rate_bp / 1_000_000)`, e.g. 1 credit × 100% × 10% = 10), `status` enum `pending | earned | dropped`, `created_at`, `settled_at`.
   - Unique (`source`, `source_ref`). Index (`user_id`, `created_at`), (`user_id`, `subject_ref`).
   - On `credit_balance`: `earned_hundredths` int (all time) and `earned_credited` int (whole credits already added). On settle: `earned_hundredths += h`; `whole = floor(earned_hundredths / 100) - earned_credited`; if `whole > 0`, `grantCredits(user, whole, "earning", "earning:{creatorEarning.id}", { free: true })` and `earned_credited += whole`, in one transaction.
5. `EARN_RATE_BP = 1000` in `src/lib/billing/catalog.ts` (placeholder; recipes read the same constant).
6. Push: `PushKind` gets `remixes`; `push_settings` default on.

### Endpoints

- `GET /api/listen/songs/[publicId]` adds:
  - `family: { path: Node[] (root → parent, max 3 + "more" count), remixCount, familySize, top: Node[3], allowRemix }`
  - `remix: { kinds: [{kind, credits}], blocked?: "off" | "ownVoice" | "tooLong" | "mine" }`, `earnRateBp`.
  - `Node = { publicId | null, title | null, handle | null, kind, depth, playCount, remixCount, gone: boolean }`.
- `GET /api/listen/songs/[publicId]/family?sort=top|new&branch={publicId}&cursor=` → nodes of the whole family, 3 children per node by default; `branch` returns all children of one node, paged by 20.
- `POST /api/songs/[id]/remix` (public id): accept only `OPEN_REMIX_KINDS = ["cover","extend","rap"]` + pro `["add-vocals","add-instrumental"]` when `proRemixAvailable`; refuse `replace` with 403 "This kind of remix isn't open on other people's songs." Write `remix_link`; insert `creator_earning` (status `pending`, with `paidRatio` taken now) when the parent's maker isn't the caller and the earning is above 0.
- Worker (`src/worker.ts`, remix job done): settle earning (`earned`, grant whole credits); on failure: refund as today, earning `dropped`. On take-down of a parent, pending rows for it become `dropped`.
- `GET /api/me/earnings?source=all|remix|recipe` → `{ totalHundredths, credited, onTheWay, rateBp, bySubject: [{source, subjectRef, title, coverUrl, count, hundredths}] }`.
- `GET /api/me/earnings/[subjectRef]?cursor=` → events `{kind, remixerHandle | null (null if the remix isn't public), at, hundredths, free: boolean}`.
- `POST /api/songs/[id]/publish` already takes `allowRemix`; add `PATCH /api/songs/[id]/remixes {allow}` for X9 so the switch doesn't re-run publish checks.
- Inbox: the existing Inbox list (gifts and duets) adds items from `creator_earning` + `remix_link` (no new table): published child → named; otherwise anonymous; batched per song per day.
- Web: `/s/{publicId}/family` page; `/songs?remixOf={publicId}` loads the web remix panel with the original.

### What each screen needs

| Screen | Data |
|---|---|
| X1 | `family.path`, `family.top`, `remixCount`, `familySize`, `allowRemix`, `remix.blocked` |
| X2–X5 | public song (title, handle, cover, duration, audio), `remix.kinds` with prices, balance, `earnRateBp`, whether the user has a cloned voice |
| X6–X7 | own song + its `remix_link` (parent title, handle, public or gone) |
| X8 | `/family` nodes, sort, branch paging |
| X9–X10 | own song: `remixCount`, private remix count, earned hundredths for this song, `allowRemix` |
| X11–X12 | earnings + links per song per day |
| X13–X15 | `/api/me/earnings`, `rateBp` |

### Reuse

- `mobile/src/app/(app)/s/[id].tsx`: add `RemixFamily` (new `mobile/src/components/remix-family.tsx`), extend the "Your song" card.
- `mobile/src/app/(app)/listen/remix/[id].tsx`: drop the cover-only filter; use the kinds from `GET /api/listen/songs/[id]` (`remix.kinds`); add the header card and credit card. `StudioRemix` does the kind options and the Make call unchanged; give it a `primaryLabel` per kind ("Make cover", "Make rap") and rename the rap label to "Rap over it" only in this screen.
- `mobile/src/components/studio-remix.tsx`: its `fallbackKinds` prices are stale (cover 2); read prices from the API only.
- `songs/publish/[id].tsx`: one read-only credit row.
- `(tabs)/inbox.tsx`: a Remixes group with the existing `ListRow`.
- `credits.tsx`: one `ListRow` "Earned from remixes and recipes" → `earn`.
- `earn.tsx` replaced; new `earn/[ref].tsx`, `s/[id]/family.tsx`, `components/family-tree.tsx`.
- Web: `src/app/s/[publicId]/song-page.tsx` gets the section (new `remixes.tsx` + CSS module), `copy.ts` gets the keys; new `src/app/s/[publicId]/family/page.tsx`; `src/app/songs/remix-panel.tsx` takes `remixOf`.
- `src/lib/listen.ts`: `remixOf` from `remix_link`; family queries.
- `src/lib/billing/credits.ts`: `paidRatio()`, ledger reason `earning`, one `settleEarning()` used by remixes and recipes.

### Acceptance criteria

1. On someone else's public song (not own voice, Allow remixes on), the Remix screen offers Cover, Extend and Rap over it with catalog prices; New words and New beat only when the pro lane is on; Replace part never; the API refuses `replace` for a public id.
2. A finished remix creates a `remix_link`; the remix's page shows "A remix of {title} by @{handle}" and the parent's page lists it once it's public.
3. A remix paid with 1 paid credit gives the parent's maker **10 hundredths (0.1 credit)**; after 10 such remixes their balance is 1 credit higher and Earnings shows "1.0 · 1 added · 0 on the way".
4. A remix paid only with welcome credits earns nothing and the Earnings detail row says "Free credits, nothing earned".
5. A failed remix refunds paid credits to paid and free to free, and its earning row is `dropped`.
6. Remixing your own song, or your own remix, creates no earning.
7. Turning off Allow remixes hides Remix for others within one page load, the API refuses new remixes, and existing remixes still show in the section and the tree.
8. A deleted or taken-down song in the middle of a chain shows as "No longer available" with its public children under it; private leaves are not shown or counted.
9. The family tree works at 200% font size, in Arabic (mirrored, rail on the right), with VoiceOver reading level and position, and on the web without JavaScript.
10. Every public page (song page, family page) keeps Report and "Made with AI".

---

## Open questions for the owner

1. **Who earns from a remix of a remix?** Options: (a) the maker of the song you remixed; (b) always the original at the top; (c) split, 5% each. **Recommend (a).** One person, named on the Remix screen, is the simplest honest promise. This reads PLAN 43's "original maker" as "the maker of the song you remixed"; (b) pays someone the remixer may never have heard.
2. **The share: 10%?** At 1 credit a remix that's 0.1 credit, so a song needs 10 paid remixes to earn 1 credit. **Recommend keeping 10%** for launch (it's a promise we can always raise, never lower) and reviewing after 30 days with real numbers. Raising remixes to 20% while keeping recipes at 10% is the alternative if remix earnings feel too small to notice.
3. **Do later spends on a remix earn too** (e.g. a music video made of the remix, 34–40 credits per 5 s)? **Recommend no for now.** Keep earnings tied to the remix itself; revisit once music videos of remixes are common, since 10% of 800 credits takes a third of that margin.
4. **Turning off remixes: this song only, or the whole family?** **Recommend this song only** (remixes of remixes follow their own makers). "Whole family" lets one person take away others' choices.
5. **Pro kinds (New words, New beat, 6 credits) on others' songs?** **Recommend yes** once the pro lane is on: they're the highest-value remixes and earn 0.6 each. Replace part stays closed.
6. **Remix on the web, now?** **Recommend yes**, through the existing web remix panel, so a WhatsApp link to a song page can turn into a remix without the app.
7. **Show earnings publicly** (e.g. "earned 23 credits" on a profile)? **Recommend never.** Show remix counts publicly; amounts stay private, like Not for me counts.
8. **Tell the original maker about private remixes?** **Recommend yes, without a name** ("Someone made a cover … +0.1"). They earned it; the remixer's privacy holds until they publish.
9. **How to count paid credits.** Options: (a) in proportion to what the payer bought over their lifetime (recipes spec); (b) a separate free balance spent first. **Recommend (a)**, aligned with recipes: no balance migration and no spend-order rule, and it's easy to say ("if a third of your credits were free, a third of your spend doesn't count").
10. **One earnings model for remixes and recipes** (needs a call before either is built). The recipes spec, written in parallel, uses ledger reason `recipe`, a `recipe_wallet` in tenths, and puts earnings in Account › Earn. **Recommend:** one ledger reason `earning` (ref `earning:{creatorEarningId}`), one `creator_earning` table with `source = remix | recipe` in hundredths, one Earnings screen with All · Remixes · Recipes chips, opened from Account › Earn (the Earn placeholder becomes this screen, as recipes proposes) and from Credits.
