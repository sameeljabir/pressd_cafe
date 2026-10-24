import "server-only";
// Server-side wiring for route handlers.

import { getDb } from "./db/mongo.ts";
import { siteUrl } from "./env.ts";

export { getDb, siteUrl };
