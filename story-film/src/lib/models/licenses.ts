// Every model the pipeline calls must be listed here. Non-commercial or
// source-available licenses are blocked so they can't slip into the product.
export interface ModelLicense {
  license: string;
  commercial: boolean;
  note?: string;
}

export const MODEL_LICENSES: Record<string, ModelLicense> = {
  "wan-2.x": { license: "Apache-2.0 (weights); fal.ai API terms", commercial: true },
  "kling-2.6": { license: "fal.ai API terms", commercial: true },
  "nano-banana-2": { license: "fal.ai / Google API terms", commercial: true, note: "SynthID stamped" },
  "kokoro-82m": { license: "Apache-2.0", commercial: true },
  "chatterbox": { license: "MIT", commercial: true, note: "built-in audio watermark" },
  "cosyvoice2": { license: "Apache-2.0", commercial: true },
  "ace-step": { license: "Apache-2.0", commercial: true },
  "faster-whisper": { license: "MIT", commercial: true },

  "xtts-v2": { license: "CPML", commercial: false, note: "Coqui defunct; no commercial license available" },
  "f5-tts": { license: "CC-BY-NC-4.0", commercial: false },
  "fish-speech": { license: "CC-BY-NC-SA-4.0", commercial: false },
  "musicgen": { license: "CC-BY-NC-4.0 (weights)", commercial: false },
  "levo-2": { license: "Non-commercial", commercial: false },
  "wav2lip": { license: "Non-commercial (OSS version)", commercial: false },
};

export function assertCommercialSafe(modelId: string): void {
  const entry = MODEL_LICENSES[modelId];
  if (!entry) {
    throw new Error(`Model "${modelId}" is not in the license allowlist; review its license before use`);
  }
  if (!entry.commercial) {
    throw new Error(`Model "${modelId}" is blocked: ${entry.license} does not allow commercial use`);
  }
}
