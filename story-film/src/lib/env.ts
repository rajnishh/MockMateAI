import { z } from "zod";

const schema = z.object({
  REDIS_URL: z.string().default("redis://localhost:6379"),
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
  ACESTEP_URL: z.string().default("http://localhost:8001"),
  OUTPUT_DIR: z.string().default("./output"),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  return schema.parse(source);
}

export function requireKey(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} is not set; see .env.example`);
  return value;
}
