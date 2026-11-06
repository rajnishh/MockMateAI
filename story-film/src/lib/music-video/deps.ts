import path from "node:path";
import { loadEnv } from "@/lib/env";
import { defaultFfmpeg } from "@/lib/ffmpeg";
import { buildImage, buildLlm, mediaStore, premiumAvailable } from "@/lib/providers";
import { buildMusicVideoProviders } from "@/lib/providers/fal-music-video";
import { KenBurnsVideo } from "@/lib/providers/kenburns";
import { CloudflareWhisper } from "@/lib/providers/whisper";
import type { MusicVideoDeps } from "./pipeline";
import type { MusicVideoKind } from "./shots";

// Lyric videos run on the free models; the other kinds need fal.ai.
export function musicVideoKindAvailable(kind: MusicVideoKind, env = loadEnv()): boolean {
  return kind === "lyric" || premiumAvailable(env);
}

export function musicVideoDeps(kind: MusicVideoKind, env = loadEnv()): MusicVideoDeps {
  const paid = kind !== "lyric";
  return {
    llm: buildLlm(env),
    image: buildImage(env, paid ? "premium" : "standard"),
    stills: new KenBurnsVideo(mediaStore(env), defaultFfmpeg),
    ...(paid ? { av: buildMusicVideoProviders(env) } : {}),
    ...(env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_API_TOKEN ? { whisper: new CloudflareWhisper(env.CLOUDFLARE_ACCOUNT_ID, env.CLOUDFLARE_API_TOKEN) } : {}),
    fontsDir: env.FONTS_DIR,
    assetsDir: path.resolve(/*turbopackIgnore: true*/ path.dirname(path.resolve(env.FONTS_DIR))),
  };
}
