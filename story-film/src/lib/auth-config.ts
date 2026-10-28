import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { phoneNumber } from "better-auth/plugins";
import { WELCOME_CREDITS } from "@/lib/billing/catalog";
import { grantCredits } from "@/lib/billing/credits";
import { type Db, schema } from "@/lib/db";
import { INDIAN_MOBILE, type SmsSender } from "@/lib/sms";

export interface AuthOptions {
  db: Db;
  sms: SmsSender;
  baseURL: string;
  secret?: string;
  google?: { clientId: string; clientSecret: string };
}

// Kept separate from auth.ts so tests can build it against an in-process database.
export function createAuth(opts: AuthOptions) {
  return betterAuth({
    baseURL: opts.baseURL,
    secret: opts.secret,
    database: drizzleAdapter(opts.db, { provider: "pg", schema }),
    // SMS costs money and attracts "SMS pumping" abuse, so OTP sends are tightly limited.
    rateLimit: {
      enabled: true,
      customRules: {
        "/phone-number/send-otp": { window: 600, max: 3 },
        "/phone-number/verify": { window: 600, max: 10 },
      },
    },
    // Every new account starts with a one-time gift of credits (idempotent per user).
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            await grantCredits(opts.db, user.id, WELCOME_CREDITS, "grant", `welcome:${user.id}`);
          },
        },
      },
    },
    socialProviders: opts.google ? { google: { ...opts.google, prompt: "select_account" } } : {},
    plugins: [
      phoneNumber({
        sendOTP: ({ phoneNumber, code }) => opts.sms.sendOtp(phoneNumber, code),
        phoneNumberValidator: (n) => INDIAN_MOBILE.test(n),
        otpLength: 6,
        expiresIn: 300,
        allowedAttempts: 3,
        // Phone-only users get a placeholder email they can replace later.
        signUpOnVerification: {
          getTempEmail: (n) => `${n.replace(/\D/g, "")}@phone.storyfilm.invalid`,
          getTempName: (n) => `Creator ${n.slice(-4)}`,
        },
      }),
      nextCookies(), // must stay last
    ],
  });
}
