# App Privacy answers ("nutrition label")

App Store Connect → Reelkar → App Privacy → Get Started. These answers match what the code does
today and what `/privacy` says. If you add analytics, crash reporting or ads later, update both.

## Do you or your third-party partners collect data from this app?

**Yes.**

## Tracking

**No.** Reelkar has no ads, no ad SDKs and no analytics SDK, and doesn't share data with data brokers.
Don't add `NSUserTrackingUsageDescription`; there's no App Tracking Transparency prompt.

## Data types collected

For every type below: **Linked to the user: Yes. Used for tracking: No. Purpose: App Functionality**
(plus Customer Support where noted). Nothing is collected for Analytics, Advertising,
Personalisation by third parties, or Developer's Advertising.

| Apple category | Data type | What it is in Reelkar |
|---|---|---|
| Contact Info | Name | Profile name; the name Apple or Google shares at sign-in |
| Contact Info | Email Address | Email-code sign-in; Apple/Google sign-in email (or Hide My Email relay) |
| Contact Info | Phone Number | SMS-code sign-in (Indian and UAE mobiles) |
| User Content | Photos or Videos | Profile photo, character photos, videos picked from Photos or filmed for editing, reels made |
| User Content | Audio Data | Hum it / singing recordings, voice-consent recordings, songs made |
| User Content | Other User Content | Topics, scripts, lyrics, captions, Ask Reelkar chat messages, reports sent (also: Customer Support) |
| User Content | Customer Support | Reports about content, feedback emails (purpose: Customer Support) |
| Identifiers | User ID | Account id and @handle |
| Purchases | Purchase History | Credit packs bought (Apple transaction id) |
| Usage Data | Product Interaction | Song plays, likes, "Not for me", reactions (they drive Listen's rails) |

**Not collected:** Health & Fitness, Financial Info (Apple/Razorpay handle payments), Location,
Sensitive Info, Contacts, Browsing History, Search History, Diagnostics, Device ID, Other Data.

Notes for answering:
- **Push token:** Apple doesn't treat an APNs push token as "Device ID"; it isn't listed.
- **IP addresses in server logs:** used only for security and rate limits, not stored against the
  account; Apple's guidance lets you leave that out. To be cautious instead, add
  Other Data → Other Data Types, purpose App Functionality.
- **Third-party AI:** data sent to fal.ai, Runware, Cloudflare, Google Gemini, Anthropic, OpenRouter,
  Groq and Sarvam to make things counts as *your* collection for App Functionality (they act for
  you). The app asks for permission before the first use (guideline 5.1.2(i)) — the "Reelkar makes
  things with AI" screen after sign-in.
