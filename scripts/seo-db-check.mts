// Checks the SEO Studio database connection and prepares its indexes.
// Usage: npm run seo:db-check            (reads MONGODB_URI from the environment or .env.local)
// Prints the host, database, server version and document counts — never the
// connection string or credentials. Changes nothing except creating missing indexes.

import { mongoUriProblem, openMongo } from "../lib/seo/db/mongo.ts";

const uri = process.env.MONGODB_URI?.trim();
const problem = mongoUriProblem(uri);
if (problem) {
  console.error(`MONGODB_URI ${problem}. Set it in .env.local (local) or in Vercel (Preview/Production).`);
  process.exit(1);
}

const hostOf = (u: string) => u.replace(/^mongodb(\+srv)?:\/\/(?:[^@/]*@)?/, "").split(/[/?]/)[0];

try {
  const db = await openMongo(uri!);
  const info = await db.db.admin().serverInfo();
  console.log(`connected   ${hostOf(uri!)}`);
  console.log(`database    ${db.db.databaseName}`);
  console.log(`server      MongoDB ${info.version}`);
  console.log(`transactions ${db.transactions ? "yes (publishing is all-or-nothing)" : "no (each document is published atomically)"}`);
  for (const [name, c] of Object.entries({ drafts: db.drafts, published: db.overrides, history: db.changes, "admin log": db.log, settings: db.settings })) {
    console.log(`${name.padEnd(12)} ${await c.estimatedDocumentCount()} document(s)`);
  }
  await db.client.close();
} catch (e) {
  // Driver messages can contain host names but not passwords; still keep it short.
  console.error(`Could not connect: ${e instanceof Error ? `${e.name}: ${e.message.split("\n")[0]}` : "unknown error"}`);
  console.error("Check the username/password, that the user has readWrite on pressd_seo, and Atlas → Network Access.");
  process.exit(1);
}
