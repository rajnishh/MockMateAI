import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Db } from "@/lib/db";
import * as schema from "@/lib/db/schema";

// The migrations run once per test file's process; every test then starts from a copy of that
// database. Running them all for each test was slow enough to time out when the machine was busy.
let template: Promise<File | Blob> | undefined;

async function migratedDump(): Promise<File | Blob> {
  const pg = new PGlite();
  await migrate(drizzle(pg, { schema }), { migrationsFolder: "./drizzle" });
  const dump = await pg.dumpDataDir();
  await pg.close();
  return dump;
}

// In-process Postgres with the real migrations applied.
export async function testDb(): Promise<Db> {
  template ??= migratedDump();
  const pg = new PGlite({ loadDataDir: await template });
  return drizzle(pg, { schema }) as unknown as Db;
}
