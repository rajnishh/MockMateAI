Story to Film turns a person's story, idea or song into a vertical video they can post. The people using it are creators across India and the Gulf, many on budget Android phones, many more comfortable in Hindi, Tamil or Arabic than in English, and most have never used a video editor. Every screen should feel as easy as WhatsApp.

The identity takes its colours from festival India and film posters: **peacock** (deep teal) is the brand, **marigold** is the one thing to tap, **kumkum** is a small spark of celebration. Shapes are soft and generous. Headings use Baloo 2, whose sister faces cover Devanagari, Bengali, Tamil, Telugu and Arabic, so a title looks like the same brand in every language.

## Voice and copy

- Write like a helpful friend, in short sentences. Lead with the verb on buttons: "Make my film", "Publish now", "Get credits", "Try again".
- Say what happens, then what to do: "We couldn't hear your code. Read the whole sentence again, slowly." Never "Error 402" or "Something went wrong" alone.
- Use "you" and "your". The app is "we" only in apologies and progress ("We're drawing your scenes").
- Name things by what people see: *My videos*, *Calendar*, *Credits*, *My voice*. Never *jobs*, *renders*, *tokens* or *webhooks*.
- Show time and cost before people commit: "About 2 minutes · 4 credits".
- No emoji in buttons, titles or errors. Icons do that job (see Iconography).
- Every string is translated. Write English copy that survives translation: no idioms, no puns, no text baked into images.

Real copy from the app:

| Moment | Copy |
| --- | --- |
| Empty library | "Your videos will appear here. Make your first one in under a minute." |
| Progress | "Writing the script" → "Drawing the scenes" → "Animating" → "Adding your voice" → "Editing" |
| Ready | "Your video is ready" + **Share** + **Download** |
| Out of credits | "You've used this week's 3 free videos. Get credits to keep creating." |
| Voice consent | "This is my own voice. I agree to Story to Film using it to sing songs for my account." |

## Languages and scripts

- Set every text style through the `display` and `body` families; they fall back across Latin, Devanagari, Bengali, Tamil, Telugu and Arabic automatically. Never hard-code a single-script font.
- Keep body line height at 1.6 (`body`, `body-lg`): Indic vowel signs above and below the line need it. Don't tighten it to fit a layout.
- Indic scripts and Arabic have no capital letters. `overline` is for Latin only; in other languages use `caption` at weight 700.
- Arabic mirrors the whole layout: back arrows point right, the tab order reverses, progress runs right to left. Icons that mean time or media (play, clock) do not mirror.
- Let labels grow. Tamil and Malayalam strings run up to 60% longer than English; buttons wrap to two lines rather than truncate.
- Show numbers in the user's numerals where the language uses them (Arabic-Indic for Arabic); keep credit counts and prices in Western digits.

## Colour

- `surface` behind every screen; `surface-raised` for cards, sheets, inputs and the tab bar; `surface-sunken` for wells (the story box, empty thumbnails, skeletons).
- Text in `ink`; secondary text in `ink-muted`. Both read on every surface in both themes.
- **One marigold per screen.** `marigold` with `on-marigold` text marks the single main action. Everything else that is tappable is `peacock` (outline or text), or neutral.
- `peacock` is the brand: the selected tab, links, secondary buttons, progress bars. On a peacock fill use `on-peacock`.
- `peacock-tint` shows selection: the active tab pill, a chosen chip, an info banner.
- `kumkum` is for the record button, "New" badges and the "ready" celebration. Keep it small; never a full-width button.
- Status colours `success`, `danger` and `warning` always come with an icon and a word. They are close in lightness, so colour alone must never tell people what happened.
- Never put `marigold` text or icons on a light surface (under 2:1). Use `marigold-text` when marigold must be text, such as credit counts.
- Hairlines are `line`; anything that must be seen as a control edge (inputs, secondary buttons) uses `line-strong`.

## Type

- One `title-lg` per screen, top-left (top-right in Arabic). Sections use `title-md`.
- `display-xl` only on onboarding and the "Your video is ready" moment.
- Running text in `body`; anything people type in `body-lg`.
- Buttons, tabs and chips use `label`. Metadata uses `caption`, in `ink-muted`.
- Respect the phone's text-size setting up to 200%. Layouts reflow; nothing clips.

## Space, size and touch

- Screen side margins `space-4`. Sections `space-5` apart. Card padding `space-4`.
- Everything tappable is at least `tap-min` (48 × 48). Buttons are `button-height` tall and full width on phones.
- Keep the main action in the thumb zone: bottom of the screen, above the tab bar.
- The tab bar is `tabbar-height` plus the device's safe area.

## Shape and elevation

- Buttons and chips are pills (`radius-pill`). Cards and inputs use `radius-md`; bottom sheets `radius-lg` on the top corners.
- Cards float on `elevation-1`. Sheets and the tab bar use `elevation-2`. Nothing else casts a shadow; in dark theme, separate by `surface-raised` first.

## Motion

- Fast and calm: 150 ms for taps and toggles, 250 ms for sheets and screen changes, ease-out.
- One celebratory moment only: the "ready" screen (a short kumkum and marigold burst).
- Progress moves continuously so people know the app hasn't frozen; never a spinner with no words.
- Respect "Reduce motion": fades only, no movement.
- Run animations on the native thread; budget phones must stay at 60 fps.

## Iconography

- Use **Lucide** (ISC licence; `lucide-react-native`): 24 px, 2 px stroke, round caps and joins, in `ink`, `ink-muted` or `peacock`.
- Every icon-only button has a text label for screen readers.
- The AI action uses Lucide `sparkles` next to the words, never alone.
- Tab icons: `house` Create, `clapperboard` My videos, `calendar-days` Calendar, `user-round` Profile.

## Logo

There is no logo yet. Until one is designed, set the name "Story to Film" in `display` at weight 700 in `ink` (or `on-peacock` on a peacock header). Do not draw an interim mark.

## States

- Loading: skeleton blocks in `surface-sunken`, never a blank screen.
- Long jobs (1–3 minutes): the MakingProgress steps, plus a push notification when done, so people can leave the app.
- Empty: a short line saying what will appear and one button to make the first one.
- Errors: what went wrong in plain words, plus one button that fixes it ("Try again", "Get credits", "Reconnect YouTube").
- Offline: keep what's on screen, say "You're offline. We'll finish when you're back."

## Accessibility

- Text contrast is 4.5:1 or better in both themes (checked for every pair named above); control edges and icons 3:1 or better.
- Focus: a 2 px `focus-ring` outline, 2 px outside the element.
- Screen-reader labels on every control; progress announces each step.
- Never rely on colour alone (see Colour).
