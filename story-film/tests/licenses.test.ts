import { describe, expect, it } from "vitest";
import { assertCommercialSafe } from "@/lib/models/licenses";

describe("model license allowlist", () => {
  it("allows permissive models", () => {
    for (const id of ["wan-2.x", "kling-2.6", "nano-banana-2", "kokoro-82m", "ace-step"]) {
      expect(() => assertCommercialSafe(id)).not.toThrow();
    }
  });

  it("blocks non-commercial models", () => {
    for (const id of ["xtts-v2", "f5-tts", "musicgen", "levo-2", "wav2lip"]) {
      expect(() => assertCommercialSafe(id)).toThrow(/blocked/);
    }
  });

  it("rejects unknown models", () => {
    expect(() => assertCommercialSafe("mystery-model")).toThrow(/allowlist/);
  });
});
