import { describe, expect, it } from "vitest";
import { RecipientLimiter } from "@/lib/otp-limit";

describe("RecipientLimiter", () => {
  it("allows max sends per recipient in the window, then again once it passes", () => {
    let now = 0;
    const limiter = new RecipientLimiter(2, 1000, () => now);
    expect([limiter.take("a"), limiter.take("a"), limiter.take("a"), limiter.take("b")]).toEqual([true, true, false, true]);
    now = 999;
    expect(limiter.take("a")).toBe(false);
    now = 1001;
    expect(limiter.take("a")).toBe(true);
  });
});
