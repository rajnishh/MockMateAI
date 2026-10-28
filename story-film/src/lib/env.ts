import { z } from "zod";

const schema = z.object({
  CLOUDFLARE_ACCOUNT_ID: z.string().optional(),
  CLOUDFLARE_API_TOKEN: z.string().optional(),
  CF_IMAGE_MODEL: z.string().optional(),
  CF_LLM_MODEL: z.string().optional(),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  DATABASE_URL: z.string().default("postgres://postgres:postgres@localhost:5432/storyfilm"),
  BETTER_AUTH_URL: z.string().default("http://localhost:3000"),
  BETTER_AUTH_SECRET: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  // 32 random bytes, base64. Encrypts connected-channel OAuth tokens.
  TOKEN_ENCRYPTION_KEY: z.string().optional(),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  SMS_PROVIDER: z.enum(["console", "msg91"]).default("console"),
  MSG91_AUTH_KEY: z.string().optional(),
  MSG91_OTP_TEMPLATE_ID: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_MODEL: z.string().default("google/gemini-2.5-flash"),
  FAL_KEY: z.string().optional(),
  VIDEO_MODEL: z.enum(["wan", "kling"]).default("wan"),
  FAL_IMAGE_MODEL_ID: z.string().optional(),
  FAL_IMAGE_EDIT_MODEL_ID: z.string().optional(),
  FAL_WAN_MODEL_ID: z.string().optional(),
  FAL_KLING_MODEL_ID: z.string().optional(),
  KOKORO_URL: z.string().default("http://localhost:8880"),
  KOKORO_VOICE: z.string().default("af_heart"),
  // Optional: without an ACE-Step server, films have narration only.
  ACESTEP_URL: z.string().optional(),
  FREE_FILMS_PER_WEEK: z.coerce.number().int().min(1).default(3),
  OUTPUT_DIR: z.string().default("./output"),
  FONTS_DIR: z.string().default("./assets/fonts"),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  return schema.parse(source);
}

export function requireKey(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} is not set; see .env.example`);
  return value;
}
