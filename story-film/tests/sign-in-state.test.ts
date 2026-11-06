import { describe, expect, it } from "vitest";

import {
  decodePendingSignIn,
  encodePendingSignIn,
  nextReady,
  PENDING_SIGN_IN_TTL_MS,
  resendWait,
} from "../mobile/src/lib/sign-in-state";

describe("mobile sign-in survives a lock or a trip to the background", () => {
  it("stays ready when the session is refetched on coming back to the front", () => {
    expect(nextReady(false, false, true)).toBe(false);
    expect(nextReady(false, true, true)).toBe(false);
    expect(nextReady(false, true, false)).toBe(true);
    // Signed out, better-auth reports the foreground refetch as pending again.
    expect(nextReady(true, true, true)).toBe(true);
  });

  it("keeps a sent code for a few minutes, then lets it go", () => {
    const sentAt = 1_000_000;
    const raw = encodePendingSignIn("+919876543210", sentAt);
    expect(decodePendingSignIn(raw, sentAt + 60_000)).toEqual({ to: "+919876543210", sentAt });
    expect(decodePendingSignIn(raw, sentAt + PENDING_SIGN_IN_TTL_MS + 1)).toBeNull();
    expect(decodePendingSignIn(raw, sentAt - 1)).toBeNull();
    expect(decodePendingSignIn(null)).toBeNull();
    expect(decodePendingSignIn("not json")).toBeNull();
    expect(decodePendingSignIn(JSON.stringify({ to: "", sentAt }))).toBeNull();
  });

  it("counts the resend wait from when the code was sent", () => {
    expect(resendWait(undefined)).toBe(30);
    expect(resendWait(0, 12_400)).toBe(18);
    expect(resendWait(0, 90_000)).toBe(0);
  });
});
