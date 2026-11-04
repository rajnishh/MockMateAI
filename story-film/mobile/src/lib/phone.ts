// Countries whose mobile numbers can sign in with an SMS code.
// Keep identical to mobile/src/lib/phone.ts (a test checks this).

export type PhoneCountry = "IN" | "AE";

export interface CountryInfo {
  code: PhoneCountry;
  name: string;
  dial: string;
  // National number without the leading 0.
  pattern: RegExp;
  digits: number;
  example: string;
}

export const PHONE_COUNTRIES: CountryInfo[] = [
  // Indian mobiles: 10 digits starting 6-9.
  { code: "IN", name: "India", dial: "+91", pattern: /^[6-9]\d{9}$/, digits: 10, example: "98765 43210" },
  // UAE mobiles: 9 digits starting 5 (people often write them as 05X...).
  { code: "AE", name: "UAE", dial: "+971", pattern: /^5\d{8}$/, digits: 9, example: "50 123 4567" },
];

export function findCountry(code: PhoneCountry): CountryInfo {
  return PHONE_COUNTRIES.find((c) => c.code === code) ?? PHONE_COUNTRIES[0];
}

// What the person typed, as a national number: digits only, without the
// country code or a leading trunk 0.
export function nationalNumber(country: PhoneCountry, typed: string): string {
  const c = findCountry(country);
  // "00" is the international prefix, as in 00971 50 123 4567.
  let digits = typed.replace(/\D/g, "").replace(/^00/, "");
  const dial = c.dial.slice(1);
  if (digits.startsWith(dial) && digits.length > c.digits) digits = digits.slice(dial.length);
  return digits.replace(/^0+/, "");
}

export function isValidMobile(country: PhoneCountry, typed: string): boolean {
  return findCountry(country).pattern.test(nationalNumber(country, typed));
}

export function toE164(country: PhoneCountry, typed: string): string {
  return `${findCountry(country).dial}${nationalNumber(country, typed)}`;
}

// Checks a number in E.164 form ("+971501234567") against the allowed countries.
export function isSignInMobile(e164: string): boolean {
  return PHONE_COUNTRIES.some((c) => e164.startsWith(c.dial) && c.pattern.test(e164.slice(c.dial.length)));
}
