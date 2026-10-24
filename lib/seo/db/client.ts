// LEGACY Postgres access, kept only for the dormant crawler / Search Console /
// PageSpeed / tasks modules (lib/seo/services/{audits,gsc,performance,tasks}.ts)
// and their tests. No route or page uses it, and nothing connects to a
// Postgres server any more: SEO Studio stores its data in MongoDB
// (lib/seo/db/mongo.ts). Delete together with those modules.

import { mkdirSync } from "node:fs";
import path from "node:path";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema.ts";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

/** Embedded Postgres for the legacy modules' tests. `dataDir` null = in memory. */
export async function openPglite(dataDir: string | null): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  if (dataDir) mkdirSync(path.dirname(dataDir), { recursive: true });
  const client = dataDir ? new PGlite(dataDir) : new PGlite();
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  return db as unknown as Db;
}

export { schema };
