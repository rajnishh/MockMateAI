import { createAuth } from "@/lib/auth-config";
import { getDb } from "@/lib/db";
import { ConsoleEmail, type EmailSender, ResendEmail } from "@/lib/email";
import { loadEnv } from "@/lib/env";
import { parseOrigins } from "@/lib/oauth/origin";
import { deletePhotos } from "@/lib/photos";
import { ConsoleSms, Msg91Sms, type SmsSender } from "@/lib/sms";

const env = loadEnv();

function smsSender(): SmsSender {
  if (env.SMS_PROVIDER === "msg91") {
    if (!env.MSG91_AUTH_KEY || !env.MSG91_OTP_TEMPLATE_ID) throw new Error("MSG91_AUTH_KEY and MSG91_OTP_TEMPLATE_ID are required");
    return new Msg91Sms(env.MSG91_AUTH_KEY, env.MSG91_OTP_TEMPLATE_ID);
  }
  return new ConsoleSms();
}

function emailSender(): EmailSender {
  if (env.EMAIL_PROVIDER === "resend") {
    if (!env.RESEND_API_KEY || !env.EMAIL_FROM) throw new Error("RESEND_API_KEY and EMAIL_FROM are required");
    return new ResendEmail(env.RESEND_API_KEY, env.EMAIL_FROM);
  }
  return new ConsoleEmail();
}

export const googleEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

export const auth = createAuth({
  db: getDb(),
  sms: smsSender(),
  email: emailSender(),
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  onUserDeleted: (userId) => deletePhotos(env.OUTPUT_DIR, userId),
  apple: { bundleId: env.APPLE_BUNDLE_ID },
  review: env.REVIEW_EMAIL && env.REVIEW_OTP ? { email: env.REVIEW_EMAIL, code: env.REVIEW_OTP } : undefined,
  google: googleEnabled ? { clientId: env.GOOGLE_CLIENT_ID!, clientSecret: env.GOOGLE_CLIENT_SECRET! } : undefined,
  // PUBLIC_ORIGINS: tunnels and domains that reach this app. In development, also quick tunnels,
  // and Expo Go and dev builds, which use exp:// URLs on the local network.
  trustedOrigins: [
    ...parseOrigins(env.PUBLIC_ORIGINS),
    ...(process.env.NODE_ENV === "development" ? ["exp://", "exp://**", "https://*.trycloudflare.com"] : []),
  ],
});
