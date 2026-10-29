import type { Currency } from "./api";

// Same rule as the web app: India → INR, UAE → AED, everyone else → USD.
export function localCurrency(): Currency {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (tz === "Asia/Kolkata" || tz === "Asia/Calcutta") return "INR";
  if (tz === "Asia/Dubai") return "AED";
  return "USD";
}

export function formatPrice(minor: number, currency: Currency): string {
  const locale = { INR: "en-IN", AED: "en-AE", USD: "en-US" }[currency];
  return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: currency === "USD" ? 2 : 0 }).format(minor / 100);
}
