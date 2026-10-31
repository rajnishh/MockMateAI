import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { loadEnv } from "@/lib/env";
import * as schema from "./schema";

// Driver-agnostic type so tests can run the same code on in-process PGlite.
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

let db: Db | undefined;

export function getDb(): Db {
  db ??= drizzle(postgres(loadEnv().DATABASE_URL, { max: 10 }), { schema }) as unknown as Db;
  return db;
}

export { schema };
