# App Store In-App Purchases: credit packs

The iPhone app sells Reelkar's three credit packs as **consumable** In-App Purchases (App Review
guideline 3.1.1). The web keeps Razorpay. Monthly plans are not sold on iPhone yet; they will
need auto-renewable subscriptions later (see the follow-up at the end).

The code: `src/lib/billing/catalog.ts` (`appStoreProductId` on each pack), `src/lib/billing/apple.ts`
(verification, crediting, refunds), `POST /api/billing/apple`, `POST /api/webhooks/apple`,
`mobile/src/lib/iap.ts` and `mobile/src/app/(app)/credits.tsx`.

## Before the products: agreements and tax

1. App Store Connect → **Business**: accept the **Paid Apps Agreement**, add the bank account and
   fill in the tax forms. Products stay "Missing Metadata" / unbuyable until this is done.
2. Enrol in the **App Store Small Business Program** (15% commission instead of 30%). See the
   margin note below; at 30% the Pro pack barely covers a premium shot.

## The three products

App Store Connect → Apps → Reelkar → **Monetization → In-App Purchases** → **+** → type
**Consumable**. Create one per row. The product id must match exactly; it can never be reused,
even after deleting the product.

| Reference name | Product ID | Credits | India (base) | UAE | United States |
|---|---|---|---|---|---|
| Credits Starter 50 | `app.reelkar.credits.starter` | 50 | ₹249 | AED 14.99 | $3.99 |
| Credits Creator 150 | `app.reelkar.credits.creator` | 150 | ₹649 | AED 36.99 | $9.99 |
| Credits Pro 400 | `app.reelkar.credits.pro` | 400 | ₹1,499 | AED 91.99 | $24.99 |

For each product:

1. **Reference name** and **Product ID** from the table (the reference name is only seen by us).
2. **Availability:** all countries where Reelkar is on sale.
3. **Price schedule:** set **India** as the base country and pick the price point nearest the
   India column, then open **Edit prices by country** and set the UAE and United States points
   from the table (Apple's own equalised prices otherwise drift from ours). These match the web
   prices in `catalog.ts` (decision 20). Apple's prices in India and the UAE include GST/VAT and
   Apple pays that tax for us. If a listed point doesn't exist, pick the nearest one.
4. **App Store localization** (add English (U.S.), English (U.K.) and, later, Hindi and Arabic):
   - Display name (max 30 characters): `50 Credits`, `150 Credits`, `400 Credits`.
   - Description (max 45 characters): `Credits for AI reels and songs. Never expire.`
5. **Review information:**
   - Screenshot: the iPhone **Credits** screen (You → Credits and plans) showing the three packs with their
     App Store prices and Buy buttons, taken from a TestFlight or sandbox build (1290 × 2796 or
     another accepted iPhone size). One screenshot can be used for all three.
   - Review notes: `Consumable credits. Buy on You → Credits and plans. Credits are used to make premium AI
     reels, songs and music videos; the balance is shown at the top right of the screen.`
6. Leave **Family Sharing** off (consumables can't be shared).
7. Save. The status becomes **Ready to Submit**. Attach all three products to the app version in
   **Distribution → (version) → In-App Purchases and Subscriptions** before submitting it for
   review; the first In-App Purchases must be reviewed together with an app version.

### Margin note

A premium 5 s shot costs us about ₹25 and is 12 credits. From a ₹1,499 Pro pack Apple first takes
GST (about ₹229) and then its commission:

- 30% commission: about ₹889 for 400 credits → ₹2.22 a credit → ₹26.7 for a premium shot (≈7% margin).
- 15% (Small Business Program): about ₹1,080 → ₹2.70 a credit → ₹32.4 a shot (≈23% margin).

So join the Small Business Program, and consider iOS prices one step higher, or fewer credits per
iOS pack, if the margin must stay at 30% (decision 20). Changing a price later is only a price
schedule change; the product ids stay.

## App Store Server Notifications V2 (refunds)

App Store Connect → Apps → Reelkar → **App Information** → **App Store Server Notifications**:

- **Production Server URL:** `https://reelkar.istari-ai.dev/api/webhooks/apple`
- **Sandbox Server URL:** `https://reelkar.istari-ai.dev/api/webhooks/apple`
- **Version:** Version 2.

The server checks Apple's signature on every notification, ignores repeats (by notification id),
and on **REFUND** or **REVOKE** takes the pack's credits back once (the balance can go below
zero if they were already spent). Everything else, including **TEST**, is answered with 200.

To test: App Store Connect API `POST /inApps/v1/notifications/test`, or refund a sandbox purchase
from the iPhone's Settings → App Store → Sandbox Account → Manage, then check the server log and
the creator's credit history (the web billing page shows "App Store purchase" rows).

## Server settings (`.env`, never committed)

- `APPLE_IAP_ENVIRONMENT=Production` on reelkar.istari-ai.dev. With Production the server accepts
  production purchases and also sandbox ones, because App Review buys with sandbox accounts.
  `Sandbox` (the default) accepts only sandbox purchases; use it for local servers.
- `APPLE_APP_APPLE_ID=<number>`: App Store Connect → App Information → **Apple ID** (required for
  Production).
- Apple's root certificates (Apple Root CA G3 and G2, public) are in `src/lib/billing/apple-roots/`;
  `APPLE_ROOT_CERTS_DIR` can point elsewhere.

## Testing before review

1. App Store Connect → Users and Access → **Sandbox** → add a sandbox tester (an unused email).
2. A new iPhone build is needed (expo-iap is a native module; an OTA update can't add it). Install
   a TestFlight or Release build, sign in to Reelkar, open You → Credits and plans and buy a pack; iOS asks
   for the sandbox account. The balance should go up by the pack's credits once, and the
   transaction is finished only after the server credited it.
3. Kill the app during a purchase, reopen it: the unfinished transaction is sent again on start
   and credited once.
4. Expo Go, the web and `EXPO_PUBLIC_DEMO=1` show "Buying isn't available here" or use the demo
   stubs; nothing crashes.

## Follow-up: monthly plans on iPhone

The Creator and Pro monthly plans are hidden on iPhone. Selling them there needs an
auto-renewable subscription group (`app.reelkar.plans`), `DID_RENEW` / `EXPIRED` / `REFUND`
handling in `POST /api/webhooks/apple`, credits granted per renewal (ref
`apple:<transactionId>`), and a "Manage subscription" link to Apple's sheet.
