import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isSignInMobile, isValidMobile, toE164 } from "@/lib/phone";

describe("sign-in phone numbers", () => {
  it("reads Indian numbers however they are typed", () => {
    expect(toE164("IN", "98765 43210")).toBe("+919876543210");
    expect(toE164("IN", "+91 98765-43210")).toBe("+919876543210");
    expect(toE164("IN", "098765 43210")).toBe("+919876543210");
    expect(isValidMobile("IN", "58765 43210")).toBe(false);
  });

  it("reads UAE numbers, with or without the leading 0", () => {
    expect(toE164("AE", "050 123 4567")).toBe("+971501234567");
    expect(toE164("AE", "50 123 4567")).toBe("+971501234567");
    expect(toE164("AE", "+971 50 123 4567")).toBe("+971501234567");
    expect(toE164("AE", "00971 50 123 4567")).toBe("+971501234567");
    expect(isValidMobile("AE", "04 123 4567")).toBe(false); // Dubai landline
  });

  it("allows only Indian and UAE mobiles to sign in", () => {
    expect(isSignInMobile("+919876543210")).toBe(true);
    expect(isSignInMobile("+971501234567")).toBe(true);
    expect(isSignInMobile("+97141234567")).toBe(false);
    expect(isSignInMobile("+15551234567")).toBe(false);
  });

  it("is the same file in the web app and the mobile app", () => {
    expect(readFileSync("mobile/src/lib/phone.ts", "utf8")).toBe(readFileSync("src/lib/phone.ts", "utf8"));
  });
});
