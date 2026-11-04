import { readFileSync } from "node:fs";
import { rename, rm } from "node:fs/promises";
import path from "node:path";
import { Builder, LocalSigner, Reader } from "@contentauth/c2pa-node";
import type { Env } from "@/lib/env";

// C2PA Content Credentials: a signed manifest inside the file that says it was
// made with generative AI (IPTC "trainedAlgorithmicMedia"). Meta, TikTok,
// LinkedIn and YouTube read it; it complements the burned-in "Created with AI"
// label and YouTube's synthetic-media flag.
export const AI_SOURCE_TYPE = "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia";
const APP = { name: "Story to Film", version: "0.1.0" };

const MIME: Record<string, string> = { ".mp4": "video/mp4", ".mp3": "audio/mpeg", ".wav": "audio/wav" };

export interface ProvenanceInfo {
  title: string;
  description: string;
}

export interface ProvenanceSigner {
  // Embeds a signed manifest into the file in place. Returns false for formats it can't sign.
  sign(file: string, info: ProvenanceInfo): Promise<boolean>;
}

export class C2paSigner implements ProvenanceSigner {
  private readonly signer: LocalSigner;

  constructor(certChainPem: Buffer, privateKeyPem: Buffer, tsaUrl?: string) {
    this.signer = LocalSigner.newSigner(certChainPem, privateKeyPem, "es256", tsaUrl);
  }

  async sign(file: string, info: ProvenanceInfo): Promise<boolean> {
    const mimeType = MIME[path.extname(file).toLowerCase()];
    if (!mimeType) return false;
    const builder = Builder.withJson({
      claim_generator_info: [APP],
      title: info.title.slice(0, 200),
      format: mimeType,
      assertions: [
        {
          label: "c2pa.actions",
          data: {
            actions: [
              { action: "c2pa.created", digitalSourceType: AI_SOURCE_TYPE, softwareAgent: APP, description: info.description },
            ],
          },
        },
      ],
    } as never);
    // Sign to a temp file, then swap, so a failure never leaves a half-written file.
    const tmp = `${file}.c2pa${path.extname(file)}`;
    try {
      builder.sign(this.signer, { path: file, mimeType }, { path: tmp, mimeType });
      await rename(tmp, file);
      return true;
    } finally {
      await rm(tmp, { force: true });
    }
  }
}

export function provenanceFromEnv(env: Env): ProvenanceSigner | undefined {
  if (!env.C2PA_CERT_CHAIN || !env.C2PA_PRIVATE_KEY) return undefined;
  return new C2paSigner(readPem(env.C2PA_CERT_CHAIN), readPem(env.C2PA_PRIVATE_KEY), env.C2PA_TSA_URL);
}

// Accepts either PEM text (e.g. from a secret manager) or a path to a PEM file.
function readPem(value: string): Buffer {
  return value.includes("-----BEGIN") ? Buffer.from(value.replace(/\\n/g, "\n")) : readFileSync(value);
}

// Signs without ever failing the job: credentials are added when possible and
// the caller records whether they were.
export async function trySign(signer: ProvenanceSigner | undefined, file: string, info: ProvenanceInfo): Promise<boolean> {
  if (!signer) return false;
  try {
    return await signer.sign(file, info);
  } catch (err) {
    console.error(`C2PA signing failed for ${path.basename(file)}:`, (err as Error).message);
    return false;
  }
}

export interface ProvenanceSummary {
  aiGenerated: boolean;
  generator?: string;
  issuer?: string;
  // Validation codes, e.g. "signingCredential.untrusted" for a development certificate.
  issues: string[];
}

export async function readProvenance(file: string): Promise<ProvenanceSummary | undefined> {
  const mimeType = MIME[path.extname(file).toLowerCase()];
  const reader = await Reader.fromAsset({ path: file, mimeType });
  if (!reader) return undefined;
  const store = reader.json();
  const manifest = store.active_manifest ? store.manifests?.[store.active_manifest] : undefined;
  if (!manifest) return undefined;
  const actions = (manifest.assertions ?? [])
    .filter((a) => a.label.startsWith("c2pa.actions"))
    .flatMap((a) => (a.data as { actions?: { digitalSourceType?: string }[] }).actions ?? []);
  return {
    aiGenerated: actions.some((a) => a.digitalSourceType === AI_SOURCE_TYPE),
    generator: manifest.claim_generator_info?.[0]?.name,
    issuer: manifest.signature_info?.issuer ?? undefined,
    issues: (store.validation_status ?? []).map((v) => v.code),
  };
}
