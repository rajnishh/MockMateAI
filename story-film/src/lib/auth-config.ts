import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { expo } from "@better-auth/expo";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { emailOTP, phoneNumber } from "better-auth/plugins";
import { WELCOME_CREDITS } from "@/lib/billing/catalog";
import { grantCredits } from "@/lib/billing/credits";
import { type Db, schema } from "@/lib/db";
import { type EmailSender, PLACEHOLDER_EMAIL_DOMAIN } from "@/lib/email";
import { RecipientLimiter } from "@/lib/otp-limit";
import { isSignInMobile } from "@/lib/phone";
import type { SmsSender } from "@/lib/sms";

export interface AuthOptions {
  db: Db;
  sms: SmsSender;
  email: EmailSender;
  baseURL: string;
  secret?: string;
  google?: { clientId: string; clientSecret: string };
  // Extra trusted origins, e.g. Expo's exp:// URLs in development.
  trustedOrigins?: string[];
  // Removes files kept outside the database (uploaded photos) once an account is deleted.
  onUserDeleted?: (userId: string) => Promise<void>;
}

// Deep-link scheme of the Reelkar mobile app (mobile/app.json "scheme").
export const MOBILE_SCHEME = "reelkar";

// The only email-code routes Reelkar uses. The plugin also has password-reset, verify-email and
// change-email routes; they would make codes nobody receives (we send only sign-in codes), which
// could then be guessed, so they stay closed.
const EMAIL_OTP_ROUTES = new Set(["/email-otp/send-verification-otp", "/sign-in/email-otp"]);
const isEmailOtpRoute = (path: string) => path.startsWith("/email-otp/") || path.endsWith("/email-otp");

// Kept separate from auth.ts so tests can build it against an in-process database.
export function createAuth(opts: AuthOptions) {
  // At most 5 codes per number or address per hour, however many IPs ask.
  const perRecipient = new RecipientLimiter(5, 60 * 60_000);
  const tooMany = () => new APIError("TOO_MANY_REQUESTS", { message: "Too many codes sent. Try again in an hour." });

  return betterAuth({
    baseURL: opts.baseURL,
    secret: opts.secret,
    database: drizzleAdapter(opts.db, { provider: "pg", schema }),
    // The mobile app signs in through deep links back to its scheme.
    trustedOrigins: [`${MOBILE_SCHEME}://`, ...(opts.trustedOrigins ?? [])],
    // SMS costs money and attracts "SMS pumping" abuse, so OTP sends are tightly limited.
    rateLimit: {
      enabled: true,
      customRules: {
        "/phone-number/send-otp": { window: 600, max: 3 },
        "/phone-number/verify": { window: 600, max: 10 },
        "/email-otp/send-verification-otp": { window: 600, max: 5 },
        "/sign-in/email-otp": { window: 600, max: 10 },
      },
    },
    // People can delete their account from the app (an App Store and Play Store requirement).
    // Their reels, voices, songs and connected accounts go with it (ON DELETE CASCADE).
    user: { deleteUser: { enabled: true, afterDelete: async (user) => opts.onUserDeleted?.(user.id) } },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (!isEmailOtpRoute(ctx.path)) return;
        const body = (ctx.body ?? {}) as { email?: unknown; type?: unknown };
        const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
        if (!EMAIL_OTP_ROUTES.has(ctx.path) || (ctx.path === "/email-otp/send-verification-otp" && body.type !== "sign-in")) {
          throw new APIError("NOT_FOUND");
        }
        // Phone-only accounts have a placeholder address. No code is made for it, so nobody
        // can sign in to those accounts by guessing an email code.
        if (email.endsWith(`@${PLACEHOLDER_EMAIL_DOMAIN}`)) throw new APIError("BAD_REQUEST", { message: "Use a real email address" });
        if (ctx.path === "/email-otp/send-verification-otp" && !perRecipient.take(`email:${email}`)) throw tooMany();
      }),
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
        sendOTP: async ({ phoneNumber, code }) => {
          // Stops SMS pumping to one number from many IPs.
          if (!perRecipient.take(`phone:${phoneNumber}`)) throw tooMany();
          await opts.sms.sendOtp(phoneNumber, code);
        },
        // Indian and UAE mobiles (src/lib/phone.ts).
        phoneNumberValidator: (n) => isSignInMobile(n),
        otpLength: 6,
        expiresIn: 300,
        allowedAttempts: 3,
        // Phone-only users get a placeholder email they can replace later.
        signUpOnVerification: {
          getTempEmail: (n) => `${n.replace(/\D/g, "")}@${PLACEHOLDER_EMAIL_DOMAIN}`,
          getTempName: (n) => `Creator ${n.slice(-4)}`,
        },
      }),
      // Sign in with a 6-digit code sent by email; the first sign-in creates the account.
      emailOTP({
        // The before hook lets only sign-in codes to real addresses through.
        // Better Auth logs a failed send instead of returning it.
        sendVerificationOTP: ({ email, otp }) => opts.email.sendOtp(email, otp),
        otpLength: 6,
        expiresIn: 300,
        allowedAttempts: 3,
      }),
      expo(),
      nextCookies(), // must stay last
    ],
  });
}
