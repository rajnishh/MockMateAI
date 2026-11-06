// Adds five sample songs, published on Listen, to accounts by phone number.
//   npm run samples -- --from <folder with sample1.mp3 … sample5.mp3 and their -cover.jpg> 9871875114 8827865938
// The files are copied into OUTPUT_DIR/songs/samples, so they stay where the app serves them.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { getDb } from "../src/lib/db";
import { loadEnv } from "../src/lib/env";
import { addSampleSongs, SAMPLE_SONGS } from "../src/lib/sample-songs";

const args = process.argv.slice(2);
const at = args.indexOf("--from");
const from = at >= 0 ? args.splice(at, 2)[1] : undefined;
// Ten digits are Indian mobiles; anything else should already be in +E.164 form.
const phones = args.map((a) => a.replace(/[\s-]/g, "")).map((a) => (/^\d{10}$/.test(a) ? `+91${a}` : a));
if (!phones.length) {
  console.error("Usage: npm run samples -- [--from <folder>] <phone> [<phone> …]");
  process.exit(1);
}

const dir = path.resolve(loadEnv().OUTPUT_DIR, "songs", "samples");
mkdirSync(dir, { recursive: true });
for (const s of SAMPLE_SONGS) {
  for (const name of [`${s.file}.mp3`, `${s.file}-cover.jpg`]) {
    const target = path.join(dir, name);
    if (existsSync(target)) continue;
    if (!from) throw new Error(`${target} is missing. Pass --from <folder> with the sample files.`);
    copyFileSync(path.join(from, name), target);
  }
}

for (const r of await addSampleSongs(getDb(), phones, dir)) {
  console.log("error" in r ? `${r.phone}: ${r.error}` : `${r.phone}: added ${r.added} songs as @${r.handle}`);
}
process.exit(0);
