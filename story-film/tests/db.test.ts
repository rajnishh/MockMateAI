import { beforeAll, describe, expect, it } from "vitest";
import { createAuth, SESSION_DAYS } from "@/lib/auth-config";
import { WELCOME_CREDITS } from "@/lib/billing/catalog";
import { getBalance } from "@/lib/billing/credits";
import { getCharacter, listCharacters, saveCharacter } from "@/lib/characters";
import type { Db } from "@/lib/db";
import { session } from "@/lib/db/auth-schema";
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
  it("creates an account on first verified sign-in and accepts only Indian and UAE mobiles", async () => {
    const sent: { phone: string; code: string }[] = [];
    const auth = createAuth({
      db,
      sms: { sendOtp: async (phone, code) => void sent.push({ phone, code }) },
      email: { sendOtp: async () => {} },
      baseURL: "http://localhost:3000",
      secret: "test-secret-test-secret-test-secret",
    });

    await expect(auth.api.sendPhoneNumberOTP({ body: { phoneNumber: "+15551234567" } })).rejects.toThrow();

    await expect(auth.api.sendPhoneNumberOTP({ body: { phoneNumber: "+97141234567" } })).rejects.toThrow(); // UAE landline
    await auth.api.sendPhoneNumberOTP({ body: { phoneNumber: "+971501234567" } });
    expect(sent.map((s) => s.phone)).toEqual(["+971501234567"]);
    sent.length = 0;

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
    // Signed in for 90 days, so the phone doesn't ask again.
    const row = (await db.select().from(session)).find((r) => r.token === result.token)!;
    expect(row.expiresAt.getTime() - Date.now()).toBeGreaterThan((SESSION_DAYS - 1) * 24 * 3600_000);
  }, 30_000);

  it("rate-limits OTP sends over HTTP", async () => {
    const auth = createAuth({
      db,
      sms: { sendOtp: async () => {} },
      email: { sendOtp: async () => {} },
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

describe("email OTP sign-in", () => {
  it("creates an account on first sign-in with an emailed code", async () => {
    const sent: { email: string; code: string }[] = [];
    const auth = createAuth({
      db,
      sms: { sendOtp: async () => {} },
      email: { sendOtp: async (email, code) => void sent.push({ email, code }) },
      baseURL: "http://localhost:3000",
      secret: "test-secret-test-secret-test-secret",
    });

    // Phone-only accounts have a placeholder address: no code is made for it, and it can't sign in.
    await expect(auth.api.sendVerificationOTP({ body: { email: "919876543210@phone.storyfilm.invalid", type: "sign-in" } })).rejects.toThrow();
    await expect(auth.api.signInEmailOTP({ body: { email: "919876543210@Phone.storyfilm.invalid", otp: "123456" } })).rejects.toThrow();
    // Only sign-in codes: password-reset and verify-email codes would never be sent, only guessed.
    await expect(auth.api.sendVerificationOTP({ body: { email: "creator@example.ae", type: "forget-password" } })).rejects.toThrow();
    await expect(auth.api.sendVerificationOTP({ body: { email: "creator@example.ae", type: "email-verification" } })).rejects.toThrow();
    expect(sent).toEqual([]);

    await auth.api.sendVerificationOTP({ body: { email: "creator@example.ae", type: "sign-in" } });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ email: "creator@example.ae", code: expect.stringMatching(/^\d{6}$/) });

    await expect(auth.api.signInEmailOTP({ body: { email: "creator@example.ae", otp: "000000" } })).rejects.toThrow();
    const result = await auth.api.signInEmailOTP({ body: { email: "creator@example.ae", otp: sent[0].code } });

    expect(result.token).toBeTruthy();
    expect(result.user).toMatchObject({ email: "creator@example.ae", emailVerified: true });
    expect(await getBalance(db, result.user.id)).toBe(WELCOME_CREDITS);
  }, 30_000);

  it("caps codes per address and per number, whatever IP asks", async () => {
    const emails: string[] = [];
    const phones: string[] = [];
    const auth = createAuth({
      db,
      sms: { sendOtp: async (phone) => void phones.push(phone) },
      email: { sendOtp: async (email) => void emails.push(email) },
      baseURL: "http://localhost:3000",
      secret: "test-secret-test-secret-test-secret",
    });
    for (let i = 0; i < 5; i++) {
      await auth.api.sendVerificationOTP({ body: { email: "flood@example.ae", type: "sign-in" } });
      await auth.api.sendPhoneNumberOTP({ body: { phoneNumber: "+971509999999" } });
    }
    await expect(auth.api.sendVerificationOTP({ body: { email: "Flood@Example.ae", type: "sign-in" } })).rejects.toThrow(/Too many codes/);
    await expect(auth.api.sendPhoneNumberOTP({ body: { phoneNumber: "+971509999999" } })).rejects.toThrow(/Too many codes/);
    expect(emails).toHaveLength(5);
    expect(phones).toHaveLength(5);
    // Others are not affected.
    await auth.api.sendVerificationOTP({ body: { email: "someone-else@example.ae", type: "sign-in" } });
    expect(emails).toHaveLength(6);
  }, 30_000);

  it("keeps the plugin's other email-code routes closed over HTTP", async () => {
    const auth = createAuth({
      db,
      sms: { sendOtp: async () => {} },
      email: { sendOtp: async () => {} },
      baseURL: "http://localhost:3000",
      secret: "test-secret-test-secret-test-secret",
    });
    const post = (path: string, body: object) =>
      auth.handler(
        new Request(`http://localhost:3000/api/auth${path}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-forwarded-for": "203.0.113.20", origin: "http://localhost:3000" },
          body: JSON.stringify(body),
        }),
      );
    expect((await post("/forget-password/email-otp", { email: "creator@example.ae" })).status).toBe(404);
    expect((await post("/email-otp/reset-password", { email: "creator@example.ae", otp: "123456", password: "x".repeat(12) })).status).toBe(404);
    expect((await post("/email-otp/verify-email", { email: "creator@example.ae", otp: "123456" })).status).toBe(404);
    expect((await post("/email-otp/send-verification-otp", { email: "creator@example.ae", type: "sign-in" })).status).toBe(200);
  }, 30_000);
});
