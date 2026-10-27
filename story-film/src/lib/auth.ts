import { createAuth } from "@/lib/auth-config";
import { getDb } from "@/lib/db";
import { loadEnv } from "@/lib/env";
import { ConsoleSms, Msg91Sms, type SmsSender } from "@/lib/sms";

const env = loadEnv();

function smsSender(): SmsSender {
  if (env.SMS_PROVIDER === "msg91") {
    if (!env.MSG91_AUTH_KEY || !env.MSG91_OTP_TEMPLATE_ID) throw new Error("MSG91_AUTH_KEY and MSG91_OTP_TEMPLATE_ID are required");
    return new Msg91Sms(env.MSG91_AUTH_KEY, env.MSG91_OTP_TEMPLATE_ID);
  }
  return new ConsoleSms();
}

export const googleEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

export const auth = createAuth({
  db: getDb(),
  sms: smsSender(),
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  google: googleEnabled ? { clientId: env.GOOGLE_CLIENT_ID!, clientSecret: env.GOOGLE_CLIENT_SECRET! } : undefined,
});
