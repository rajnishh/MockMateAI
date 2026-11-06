import { describe, expect, it } from "vitest";
import { retryRequest } from "@/lib/retry-film";
import { parseFilmRequest } from "@/lib/start-film";

const row = { story: "दिवाली पर 100 रुपये में मिठाई बनाने की आसान विधि", style: "photoreal" as const, format: "story" as const, durationSec: 60, kidSafe: false, quality: "standard" as const, characterId: null };

describe("trying a failed reel again", () => {
  it("sends the original request back without what startFilm fills in", () => {
    const job = { userId: "user-1", story: row.story, style: "photoreal", durationSec: 60, language: "hi", brand: { handle: "@chef" }, resolution: "720p", watermark: true, quotaKey: "quota:films:user-1:2026-W45", credits: 0, character: { name: "Asha" }, photoUrl: "/tmp/p.jpg" };
    const body = retryRequest(row, job);
    expect(body).toEqual({ story: row.story, style: "photoreal", durationSec: 60, language: "hi", brand: { handle: "@chef" } });
    expect(parseFilmRequest("user-1", body)).toMatchObject({ language: "hi", durationSec: 60 });
  });

  it("falls back to the reel's saved fields and names the recipe again", () => {
    const body = retryRequest(row, undefined, "abc123");
    expect(body).toEqual({ story: row.story, style: "photoreal", format: "story", durationSec: 60, kidSafe: false, quality: "standard", recipe: "abc123" });
    expect(parseFilmRequest("user-1", body)).toMatchObject({ style: "photoreal", format: "story" });
  });
});
