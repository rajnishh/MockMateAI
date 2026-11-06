import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { creatorProfile, user } from "@/lib/db/schema";
import { listenHome } from "@/lib/listen";
import { addSampleSongs, SAMPLE_SONGS } from "@/lib/sample-songs";
import { listSongs } from "@/lib/songs/songs";
import { testDb } from "./helpers/db";

describe("sample songs", () => {
  it("fills an account and Listen once, and leaves accounts it can't find alone", async () => {
    const db = await testDb();
    const now = new Date();
    await db.insert(user).values({ id: "u1", name: "Creator 5114", email: "u1@example.com", phoneNumber: "+919871875114", createdAt: now, updatedAt: now });

    const first = await addSampleSongs(db, ["+919871875114", "+919835801812"], "/samples");
    expect(first[0]).toMatchObject({ phone: "+919871875114", added: SAMPLE_SONGS.length });
    expect(first[1]).toMatchObject({ phone: "+919835801812", error: expect.stringContaining("No account") });
    const again = await addSampleSongs(db, ["+919871875114"], "/samples");
    expect(again[0]).toMatchObject({ added: 0 });

    expect(await listSongs(db, "u1")).toHaveLength(SAMPLE_SONGS.length);
    const home = await listenHome(db);
    expect(home.new.length).toBeGreaterThan(0);
    // The handle it picked can be changed straight away.
    const [p] = await db.select().from(creatorProfile).where(eq(creatorProfile.userId, "u1"));
    expect(p.handleChangedAt.getTime()).toBe(0);
  });
});
