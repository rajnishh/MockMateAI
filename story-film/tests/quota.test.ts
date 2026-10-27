import { describe, expect, it } from "vitest";
import { estimateCostUsd, FREE_PLAN, isoWeekKey, shotCountFor } from "@/lib/quota/plans";
import { type QuotaStore, reserveFilm } from "@/lib/quota/quota";

class MemoryStore implements QuotaStore {
  counts = new Map<string, number>();
  async increment(key: string) {
    const n = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, n);
    return n;
  }
  async decrement(key: string) {
    this.counts.set(key, (this.counts.get(key) ?? 0) - 1);
  }
}

describe("free plan quota", () => {
  it("allows one film per week and rejects the second", async () => {
    const store = new MemoryStore();
    const now = new Date("2026-10-27T10:00:00Z");
    expect((await reserveFilm(store, "u1", 30, FREE_PLAN, now)).ok).toBe(true);
    const second = await reserveFilm(store, "u1", 30, FREE_PLAN, now);
    expect(second.ok).toBe(false);
    // The rejected attempt must not consume quota.
    expect([...store.counts.values()]).toEqual([1]);
  });

  it("resets the next ISO week", async () => {
    const store = new MemoryStore();
    await reserveFilm(store, "u1", 30, FREE_PLAN, new Date("2026-10-27T10:00:00Z"));
    expect((await reserveFilm(store, "u1", 30, FREE_PLAN, new Date("2026-11-02T10:00:00Z"))).ok).toBe(true);
  });

  it("rejects films longer than the plan allows", async () => {
    const result = await reserveFilm(new MemoryStore(), "u1", 90);
    expect(result.ok).toBe(false);
  });
});

describe("plans", () => {
  it("computes ISO week keys across year boundaries", () => {
    expect(isoWeekKey(new Date("2026-01-01T00:00:00Z"))).toBe("2026-W01");
    expect(isoWeekKey(new Date("2027-01-01T00:00:00Z"))).toBe("2026-W53");
  });

  it("estimates a 60s Wan 720p film in the plan's $6.50-7.50 range", () => {
    expect(shotCountFor(60)).toBe(12);
    const cost = estimateCostUsd("wan-2.x", "720p", 60);
    expect(cost).toBeGreaterThanOrEqual(6.5);
    expect(cost).toBeLessThanOrEqual(7.5);
  });
});
