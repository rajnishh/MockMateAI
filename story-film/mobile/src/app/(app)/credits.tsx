import { useState } from "react";

import { Banner, Card, ChipRow, Credits, Header, ListRow, Screen, Skeleton, Txt } from "@/components/ui";
import { api, type Currency } from "@/lib/api";
import { formatPrice, localCurrency } from "@/lib/money";
import { useData } from "@/lib/use-data";

export default function CreditsScreen() {
  const billing = useData(() => api.billing());
  const [currency, setCurrency] = useState<Currency>(localCurrency());
  const b = billing.data;

  return (
    <Screen>
      <Header title="Credits and plans" back right={<Credits count={b?.balance ?? null} onPress={() => undefined} />} />
      <Banner kind="info" title="Free beta" text="Buying credits opens after the beta. Need more for testing? Tell us in Account → Send feedback." />
      {!b ? (
        <Skeleton height={240} />
      ) : (
        <>
          <Card>
            <Txt variant="md">What things cost</Txt>
            <ListRow title="Standard reel" sub={`Free ${b.freeVideosPerWeek} a week, then 1 credit`} right={null} />
            <ListRow title="Premium AI animation" sub={`${b.premiumCreditsPerShot} credits per 5 seconds`} right={null} />
            <ListRow title="Song" sub="4 credits" right={null} />
          </Card>
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
    </Screen>
  );
}
