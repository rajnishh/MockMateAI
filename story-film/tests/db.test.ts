import { beforeAll, describe, expect, it } from "vitest";
import { createAuth } from "@/lib/auth-config";
import { WELCOME_CREDITS } from "@/lib/billing/catalog";
import { getBalance } from "@/lib/billing/credits";
import { getCharacter, listCharacters, saveCharacter } from "@/lib/characters";
import type { Db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { createFilm, filmView, getFilm, listFilms, updateFilm } from "@/lib/films";
import { testDb } from "./helpers/db";

let db: Db;

beforeAll(async () => {
  db = await testDb();
  const now = new Date();
  await db.insert(user).values([
    { id: "u1", name: "One", email: "one@example.com", createdAt: now, updatedAt: now },
    { id: "u2", name: "Two", email: "two@example.com", createdAt: now, updatedAt: now },
  ]);
}, 30_000);

describe("characters and films", () => {
  it("keeps each user's characters private", async () => {
    const c = await saveCharacter(db, "u1", {
      id: crypto.randomUUID(),
      name: "Mia",
      description: "toddler with a curly bun",
      style: "animated",
      referenceImageUrl: "file:///ref.jpg",
      seed: 7,
    });
    expect((await listCharacters(db, "u1")).map((x) => x.name)).toEqual(["Mia"]);
    expect(await getCharacter(db, "u2", c.id)).toBeUndefined();
  });

  it("tracks a film from queued to completed and hides it from other users", async () => {
    const film = await createFilm(db, { userId: "u1", story: "a story", style: "animated", durationSec: 30 });
    expect(filmView(film)).toMatchObject({ status: "queued", videoUrl: null });

    await updateFilm(db, film.id, { status: "completed", title: "Done", outputPath: "/srv/out/film.mp4" });
    const done = (await getFilm(db, "u1", film.id))!;
    expect(filmView(done)).toMatchObject({ status: "completed", title: "Done", videoUrl: `/api/films/${film.id}/video` });
    expect(filmView(done)).not.toHaveProperty("outputPath");

    expect(await getFilm(db, "u2", film.id)).toBeUndefined();
    expect(await listFilms(db, "u2")).toEqual([]);
  });
});

describe("phone OTP sign-in", () => {
  it("creates an account on first verified sign-in and rejects non-Indian numbers", async () => {
    const sent: { phone: string; code: string }[] = [];
    const auth = createAuth({
      db,
      sms: { sendOtp: async (phone, code) => void sent.push({ phone, code }) },
      baseURL: "http://localhost:3000",
      secret: "test-secret-test-secret-test-secret",
    });

    await expect(auth.api.sendPhoneNumberOTP({ body: { phoneNumber: "+15551234567" } })).rejects.toThrow();

    await auth.api.sendPhoneNumberOTP({ body: { phoneNumber: "+919876543210" } });
    expect(sent).toHaveLength(1);
    expect(sent[0].code).toMatch(/^\d{6}$/);

    await expect(auth.api.verifyPhoneNumber({ body: { phoneNumber: "+919876543210", code: "000000" } })).rejects.toThrow();
    const result = await auth.api.verifyPhoneNumber({ body: { phoneNumber: "+919876543210", code: sent[0].code } });

    expect(result.status).toBe(true);
    expect(result.user).toMatchObject({ phoneNumber: "+919876543210", phoneNumberVerified: true });
    expect(result.token).toBeTruthy();
    // New accounts start with the one-time welcome gift.
    expect(await getBalance(db, result.user.id)).toBe(WELCOME_CREDITS);
  }, 30_000);

  it("rate-limits OTP sends over HTTP", async () => {
    const auth = createAuth({
      db,
      sms: { sendOtp: async () => {} },
      baseURL: "http://localhost:3000",
      secret: "test-secret-test-secret-test-secret",
    });
    const send = () =>
      auth.handler(
        new Request("http://localhost:3000/api/auth/phone-number/send-otp", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-forwarded-for": "203.0.113.9", origin: "http://localhost:3000" },
          body: JSON.stringify({ phoneNumber: "+919811111111" }),
        }),
      );
    const statuses = [];
    for (let i = 0; i < 4; i++) statuses.push((await send()).status);
    expect(statuses).toEqual([200, 200, 200, 429]);
  }, 30_000);
});
