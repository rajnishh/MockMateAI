# App Review information

App Store Connect → Reelkar → version 1.0 → App Review Information.

## Sign-in information

Tick **Sign-in required**.

- **User name:** the `REVIEW_EMAIL` you set on the server (suggested: `review@reelkar.app`, or any
  address you control; it's never emailed).
- **Password:** the `REVIEW_OTP` you set (6 digits, not shared anywhere else).

Set both in the server's `.env` (llll-77477b worktree), restart the web app once at a quiet time,
and check it yourself: Sign in → Email → that address → Send code → enter the 6 digits. Give the
account about 200 credits so the reviewer can try paid things without buying (sign in with it
once first, then, in `story-film/`):

```bash
npm run credits:grant -- review@reelkar.app 200 app-review-1
```

## Notes (paste into "Notes")

```
Reelkar is an AI studio for Indian and Gulf creators: it makes short reels, songs and music videos from a typed idea, a hummed tune, or a video the user filmed.

SIGN-IN
Use the demo account above: on the sign-in screen choose Email, enter the address, tap Send code, then type the 6-digit code given as the password. No email is sent to that address; the code is fixed for review. Sign in with Apple, Google and SMS codes also work.

AI AND PRIVACY
After sign-in the app asks permission before anything is sent to the AI services that make content (screen "Reelkar makes things with AI"). Everything made is labelled "Made with AI" and carries C2PA Content Credentials. Adding your own singing voice requires reading a one-time code aloud on a consent recording, so nobody can clone someone else's voice.

USER-GENERATED CONTENT
Songs and recipes are private unless the user publishes them on Listen. Every public song, recipe, gift and Jugalbandi has Report and Block. Content reported by 3 people (or once for child safety) is hidden automatically until we review it; we review reports within 24 hours. Users accept the Terms (zero tolerance for objectionable content) on the first screen. Block list: You > Settings > Blocked creators.

IN-APP PURCHASES
Credits are consumable In-App Purchases (You > Credits and plans). The demo account already has credits. Credits are refunded automatically if making something fails.

THINGS TO TRY (2-5 minutes each)
- Create tab > Reel > type "3 tips for monsoon skin care" > Standard quality (free) > Make.
- Studio > Song > pick a genre > Make a song.
- Listen tab: play a song; Report and Block are on the song page.

ACCOUNT DELETION
You > Settings > Delete account.

BACKGROUND AUDIO
UIBackgroundModes audio is used by the Listen player so songs keep playing on the lock screen.

Contact: <your phone and email>
```

## Contact information

Your name, phone number and email; Apple calls if something blocks review.

## Age rating questionnaire (expected result 13+)

Answer for what the app can show, not what it usually shows:

| Question | Answer |
|---|---|
| Cartoon or fantasy violence | Infrequent/Mild (AI cartoon stories) |
| Realistic violence, sexual content, nudity, profanity, horror, drugs, alcohol, tobacco, gambling, contests | None |
| Mature or suggestive themes | None |
| Medical or treatment information | None |
| Unrestricted web access | No |
| User-generated content | Yes (Listen, recipes, gifts, Jugalbandi), with reporting and blocking |
| Messaging or chat between users | No (gifts and duet invites are links, with no free-text chat) |
| Advertising | No |
| Age assurance / parental controls | No |
| Made for Kids | No (don't choose the Kids category: the app has UGC and AI generation) |

## Export compliance

`ITSAppUsesNonExemptEncryption` is already `false` in `app.json` (the app uses only HTTPS and
Apple's own encryption), so App Store Connect won't ask on each build.

## Server during review

Review takes 1–3 days, and Apple may sign in at any hour. If the server is down, the review fails
(guideline 2.1). See `docs/PLAN.md` item 48, "Server uptime".
