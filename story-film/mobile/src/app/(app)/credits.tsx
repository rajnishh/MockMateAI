import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Platform } from "react-native";

import { Banner, Button, Card, ChipRow, Credits, Header, ListRow, Row, Screen, Skeleton, Txt, Win } from "@/components/ui";
import { api, type Billing, type Currency } from "@/lib/api";
import { buyPack, iapAvailable, onAppleCredit, storeProducts, type StoreProduct } from "@/lib/iap";
import { formatPrice, localCurrency } from "@/lib/money";
import { creditAmount } from "@/lib/remixes";
import { useData } from "@/lib/use-data";

// On the iPhone, credit packs are sold with Apple In-App Purchase at the App Store's own prices
// (App Review guideline 3.1.1), so our ₹/AED/$ prices and the monthly plans aren't shown there.
// Android and the web keep the beta screen with our prices and no buying.
const IOS = Platform.OS === "ios";

export default function CreditsScreen() {
  const billing = useData(() => api.billing());
  const earned = useData(() => api.earnings());
  const [currency, setCurrency] = useState<Currency>(localCurrency());
  const b = billing.data;

  return (
    <Screen>
      <Header title={IOS ? "Credits" : "Credits and plans"} back right={<Credits count={b?.balance ?? null} onPress={() => undefined} />} />
      {IOS ? null : <Banner kind="info" title="Free beta" text="Buying credits opens after the beta. Need more for testing? Tell us in You → Send feedback." />}
      {!b ? (
        <Skeleton height={240} />
      ) : (
        <>
          {IOS ? <ApplePacks billing={b} onCredited={billing.reload} /> : null}
          <Card>
            <ListRow icon="earn" title="Earned from remixes and recipes" sub={earned.data ? `${creditAmount(earned.data.totalHundredths)} credits` : undefined} onPress={() => router.push("/earn")} />
          </Card>
          <Card>
            <Txt variant="md">What things cost</Txt>
            <ListRow title="Standard reel" sub={`Free ${b.freeVideosPerWeek} a week, then 1 credit`} right={null} />
            <ListRow title="Premium AI animation" sub={`${b.premiumCreditsPerShot} credits per 5 seconds`} right={null} />
            <ListRow title="Song" sub="1 credit a version, 2 for a short Lyria one" right={null} />
          </Card>
          {IOS ? null : (
            <>
              <ChipRow<Currency>
                options={[
                  { value: "INR", label: "₹ INR" },
                  { value: "AED", label: "AED" },
                  { value: "USD", label: "$ USD" },
                ]}
                value={currency}
                onChange={setCurrency}
              />
              <Card>
                <Txt variant="md">Monthly plans (after the beta)</Txt>
                {b.plans.map((p) => (
                  <ListRow key={p.id} title={p.name} sub={`${p.credits} credits every month`} right={<Txt variant="label">{formatPrice(p.price[currency], currency)}</Txt>} />
                ))}
              </Card>
              <Card>
                <Txt variant="md">Credit packs</Txt>
                {b.packs.map((p) => (
                  <ListRow key={p.id} title={`${p.credits} credits`} sub="Never expire" right={<Txt variant="label">{formatPrice(p.price[currency], currency)}</Txt>} />
                ))}
              </Card>
              <Txt variant="cap">
                {currency === "INR" ? "Prices include GST." : currency === "AED" ? "Prices include 5% VAT." : "Local taxes may apply."}
              </Txt>
            </>
          )}
        </>
      )}
    </Screen>
  );
}

// Credit packs from the App Store, each with the store's localized price and a Buy button.
function ApplePacks({ billing, onCredited }: { billing: Billing; onCredited: () => void }) {
  const available = iapAvailable();
  const packs = billing.packs.filter((p) => p.appStoreProductId);
  const [products, setProducts] = useState<StoreProduct[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [buying, setBuying] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "win" | "info" | "error"; text: string } | null>(null);
  const ids = packs.map((p) => p.appStoreProductId!).join(",");

  useEffect(() => {
    if (!available || !ids) return;
    let live = true;
    storeProducts(ids.split(","))
      .then((list) => live && setProducts(list ?? []))
      .catch(() => live && setLoadError("Couldn't reach the App Store. Check your connection and open this screen again."));
    return () => {
      live = false;
    };
  }, [available, ids]);

  // A purchase finished in the background (Ask to Buy approved, or re-sent on start): refresh the balance.
  useEffect(() => onAppleCredit(() => onCredited()), [onCredited]);

  if (!available) {
    return <Banner kind="warn" title="Buying isn't available here" text="Credit packs can be bought in the App Store version of Reelkar. Your credits and reels are safe." />;
  }

  async function buy(productId: string) {
    setBuying(productId);
    setNotice(null);
    try {
      const r = await buyPack(productId);
      if (r.kind === "credited") {
        setNotice({ kind: "win", text: `${r.credit.credits} credits added. You have ${r.credit.balance}.` });
        onCredited();
      } else if (r.kind === "pending") {
        setNotice({ kind: "info", text: "Waiting for approval. The credits arrive as soon as the App Store confirms it." });
      }
    } catch (err) {
      setNotice({ kind: "error", text: (err as Error).message || "The purchase didn't go through. You weren't charged twice; try again." });
    } finally {
      setBuying(null);
    }
  }

  return (
    <>
      {notice?.kind === "win" ? <Win text={notice.text} /> : null}
      {notice && notice.kind !== "win" ? <Banner kind={notice.kind} text={notice.text} /> : null}
      <Card>
        <Txt variant="md">Credit packs</Txt>
        {loadError ? (
          <Txt variant="cap">{loadError}</Txt>
        ) : !products ? (
          <Skeleton height={140} />
        ) : products.length === 0 ? (
          <Txt variant="cap">Credit packs aren&apos;t in the App Store yet. Try again later.</Txt>
        ) : (
          packs.map((p) => {
            const product = products.find((x) => x.productId === p.appStoreProductId);
            if (!product) return null;
            return (
              <ListRow
                key={p.id}
                title={`${p.credits} credits`}
                sub="Never expire"
                right={
                  <Row>
                    <Txt variant="label">{product.displayPrice}</Txt>
                    <Button
                      small
                      label="Buy"
                      loading={buying === product.productId}
                      disabled={buying !== null && buying !== product.productId}
                      onPress={() => buy(product.productId)}
                    />
                  </Row>
                }
              />
            );
          })
        )}
      </Card>
      <Txt variant="cap">Paid with your Apple ID. Credits work on every device you sign in to.</Txt>
    </>
  );
}
