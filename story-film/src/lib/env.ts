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
  // Other public addresses that reach this app, comma separated (for example a named Cloudflare
  // Tunnel while BETTER_AUTH_URL stays localhost). Sign-in and the connector's OAuth accept them.
  PUBLIC_ORIGINS: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  // Instagram API with Instagram Login (Meta App Dashboard → Instagram → API setup).
  INSTAGRAM_APP_ID: z.string().optional(),
  INSTAGRAM_APP_SECRET: z.string().optional(),
  // 32 random bytes, base64. Encrypts connected-channel OAuth tokens.
  TOKEN_ENCRYPTION_KEY: z.string().optional(),
  // C2PA signing: PEM text or file paths. See scripts/dev-c2pa-cert.sh for a dev certificate.
  C2PA_CERT_CHAIN: z.string().optional(),
  C2PA_PRIVATE_KEY: z.string().optional(),
  // RFC 3161 timestamp authority, so signatures stay valid after the certificate expires.
  C2PA_TSA_URL: z.string().optional(),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  SMS_PROVIDER: z.enum(["console", "msg91"]).default("console"),
  MSG91_AUTH_KEY: z.string().optional(),
  MSG91_OTP_TEMPLATE_ID: z.string().optional(),
  // Email sign-in codes. "console" prints them in the server log.
  EMAIL_PROVIDER: z.enum(["console", "resend"]).default("console"),
  RESEND_API_KEY: z.string().optional(),
  // Sender on a domain verified in Resend, e.g. "Reelkar <login@reelkar.app>".
  EMAIL_FROM: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_MODEL: z.string().default("google/gemini-2.5-flash"),
  // Ask Reelkar's brain: "free" (Workers AI / OpenRouter, one-shot plan), "gemini" (tool use, free
  // within Google's limits) or "claude" (tool use, paid per message).
  ASK_REELKAR_AI: z.enum(["free", "gemini", "claude"]).default("free"),
  ANTHROPIC_API_KEY: z.string().optional(),
  ASK_REELKAR_CLAUDE_MODEL: z.string().default("claude-haiku-5-5"),
  GEMINI_API_KEY: z.string().optional(),
  // A free Groq key: the last engine in Reelkar's own AI lane.
  GROQ_API_KEY: z.string().optional(),
  // Optional: an Ollama server (e.g. http://127.0.0.1:11434). It becomes the last engine in Reelkar's
  // own AI lane, and creators can pick it in their engine lists.
  OLLAMA_URL: z.string().url().optional(),
  // The model in Reelkar's lane on that server.
  OLLAMA_LLM_MODEL: z.string().default("gemma3:12b"),
  // Google retires Gemini models for new keys (2.5 Flash was, by 2026-11-05).
  ASK_REELKAR_GEMINI_MODEL: z.string().default("gemini-3.5-flash"),
  // Gemini's model in Reelkar's own AI lane.
  GEMINI_LLM_MODEL: z.string().default("gemini-3.5-flash"),
  FAL_KEY: z.string().optional(),
  // Optional: ACE-Step 1.5 on Runware for pro remixes (cover strength, add vocals, add music).
  RUNWARE_API_KEY: z.string().optional(),
  VIDEO_MODEL: z.enum(["wan", "kling"]).default("wan"),
  FAL_IMAGE_MODEL_ID: z.string().optional(),
  FAL_IMAGE_EDIT_MODEL_ID: z.string().optional(),
  FAL_WAN_MODEL_ID: z.string().optional(),
  FAL_KLING_MODEL_ID: z.string().optional(),
  // Cinematic quality: "kling" (Kling 3.0 Pro, best value) or "veo" (Veo 3.1, most realistic, twice the price).
  CINEMATIC_VIDEO_MODEL: z.enum(["kling", "veo"]).default("kling"),
  FAL_KLING3_MODEL_ID: z.string().optional(),
  FAL_VEO_MODEL_ID: z.string().optional(),
  // Indian-language narration (Marathi, Bengali, Tamil, Telugu).
  SARVAM_API_KEY: z.string().optional(),
  SARVAM_TTS_MODEL: z.string().default("bulbul:v4-flash"),
  KOKORO_URL: z.string().default("http://localhost:8880"),
  KOKORO_VOICE: z.string().default("af_heart"),
  // Optional: without an ACE-Step server, films have narration only.
  ACESTEP_URL: z.string().optional(),
  // Optional self-hosted Seed-VC singing-voice service; otherwise Chatterbox on fal.ai is used.
  SEEDVC_URL: z.string().optional(),
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
