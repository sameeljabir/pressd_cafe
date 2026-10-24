// MongoDB storage for SEO Studio.
//  - MONGODB_URI set → that deployment (MongoDB Atlas in Preview/Production).
//  - Not set, outside production → a local MongoDB that persists in ./.data
//    (development only; started on demand, no credentials needed).
//  - Not set in production → DatabaseUnavailableError (fail closed: no
//    in-memory fallback, nothing is ever "saved" without a database).
// One client per server process is cached on globalThis and reused across requests.

import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { MongoClient, type ClientSession, type Collection, type Db as MongoDb, type ObjectId } from "mongodb";

export const DEFAULT_DB_NAME = "pressd_seo";
export const LOCAL_DATA_DIR = path.join(process.cwd(), ".data", "seo-mongo");

/** Published values of one document ("/" tags, "@images" alt text, "@business"). */
export interface OverrideDoc {
  _id: string;
  fields: object;
  version: number;
  publishedBy: string;
  publishedAt: Date;
}

/** Saved, unpublished edits. Never read by the public site. */
export interface DraftDoc {
  _id: string;
  fields: object;
  savedBy: string;
  savedAt: Date;
}

/** One publish or restore: full before/after snapshot, unique per (key, version). */
export interface ChangeDoc {
  _id: ObjectId;
  key: string;
  actor: string;
  action: "publish" | "restore" | "reset";
  before: object;
  after: object;
  version: number;
  at: Date;
  verified: boolean | null;
  verificationNote: string | null;
  /** false only while a publish without transaction support is in progress (or was interrupted). */
  applied: boolean;
}

/** Sign-ins, lockouts and other security-relevant admin actions. */
export interface LogDoc {
  _id?: ObjectId;
  at: Date;
  actor: string;
  action: string;
  target: string | null;
  details: Record<string, unknown> | null;
}

export interface SettingsDoc {
  _id: string;
  thresholds: object;
  crawlLimits?: object;
  updatedBy: string | null;
  updatedAt: Date | null;
}

export interface Db {
  client: MongoClient;
  db: MongoDb;
  overrides: Collection<OverrideDoc>;
  drafts: Collection<DraftDoc>;
  changes: Collection<ChangeDoc>;
  log: Collection<LogDoc>;
  settings: Collection<SettingsDoc>;
  /** Multi-document transactions are available (any replica set, including every Atlas cluster). */
  transactions: boolean;
}

export class DatabaseUnavailableError extends Error {
  constructor(reason = "MONGODB_URI is not configured") {
    super(reason);
    this.name = "DatabaseUnavailableError";
  }
}

/** Checks MONGODB_URI without ever returning or logging its value. */
export function mongoUriProblem(uri: string | undefined): string | null {
  const u = uri?.trim();
  if (!u) return "not set";
  if (!/^mongodb(\+srv)?:\/\//.test(u)) return "must start with mongodb+srv:// or mongodb://";
  if (/<db_username>|<db_password>|<password>|<username>/i.test(u)) return "still contains the <db_username>/<db_password> placeholders";
  return null;
}

/** Opens a client and prepares the collections and indexes (idempotent). */
export async function openMongo(uri: string, dbName?: string): Promise<Db> {
  const client = new MongoClient(uri, { appName: "pressd-seo-studio", serverSelectionTimeoutMS: 5000, maxPoolSize: 10 });
  await client.connect();
  try {
    // The database named in the URI (…mongodb.net/pressd_seo?…); the driver reports "test" when there is none.
    const fromUri = client.options.dbName;
    const db = client.db(dbName ?? (fromUri && fromUri !== "test" ? fromUri : DEFAULT_DB_NAME));
    const hello = await db.admin().command({ hello: 1 });
    const out: Db = {
      client,
      db,
      overrides: db.collection<OverrideDoc>("seo_metadata_overrides"),
      drafts: db.collection<DraftDoc>("seo_metadata_drafts"),
      changes: db.collection<ChangeDoc>("seo_metadata_changes"),
      log: db.collection<LogDoc>("seo_admin_log"),
      settings: db.collection<SettingsDoc>("seo_settings"),
      transactions: !!(hello.setName || hello.msg === "isdbgrid"),
    };
    await Promise.all([
      out.changes.createIndexes([
        { key: { key: 1, version: 1 }, name: "key_version_unique", unique: true },
        { key: { key: 1, at: -1 }, name: "key_at" },
        { key: { at: -1 }, name: "at" },
      ]),
      out.log.createIndexes([
        { key: { action: 1, target: 1, at: -1 }, name: "action_target_at" },
        { key: { action: 1, "details.ip": 1, at: -1 }, name: "action_ip_at" },
        { key: { at: -1 }, name: "at" },
      ]),
    ]);
    return out;
  } catch (e) {
    await client.close().catch(() => {});
    throw e;
  }
}

const g = globalThis as unknown as { __seoMongo?: Promise<Db>; __seoLocalMongo?: Promise<string> };

/** Port of the development database (127.0.0.1 only; away from MongoDB's default 27017). */
export const LOCAL_PORT = 47017;

/**
 * Development only: a local mongod whose data lives in .data/seo-mongo. It is
 * reused if already running (it can outlive a stopped `next dev`), so a restart
 * never starts a second server on the same data folder.
 */
async function localUri(): Promise<string> {
  if (!g.__seoLocalMongo) {
    g.__seoLocalMongo = (async () => {
      const uri = `mongodb://127.0.0.1:${LOCAL_PORT}/${DEFAULT_DB_NAME}`;
      const probe = new MongoClient(uri, { serverSelectionTimeoutMS: 1000 });
      try {
        await probe.connect();
        await probe.db().command({ ping: 1 });
        return uri;
      } catch {
        // not running yet
      } finally {
        await probe.close().catch(() => {});
      }
      const { MongoMemoryServer } = await import("mongodb-memory-server-core");
      mkdirSync(LOCAL_DATA_DIR, { recursive: true });
      await MongoMemoryServer.create({ instance: { ip: "127.0.0.1", port: LOCAL_PORT, dbPath: LOCAL_DATA_DIR, storageEngine: "wiredTiger" } });
      return uri;
    })().catch((e) => {
      g.__seoLocalMongo = undefined;
      throw e;
    });
  }
  return g.__seoLocalMongo;
}

async function connect(): Promise<Db> {
  const uri = process.env.MONGODB_URI?.trim();
  if (uri) {
    const problem = mongoUriProblem(uri);
    if (problem) throw new DatabaseUnavailableError(`MONGODB_URI ${problem}`);
    return openMongo(uri);
  }
  if (process.env.NODE_ENV === "production") throw new DatabaseUnavailableError();
  return openMongo(await localUri());
}

export function getDb(): Promise<Db> {
  if (!g.__seoMongo) {
    g.__seoMongo = connect().catch((e) => {
      g.__seoMongo = undefined; // allow a retry on the next request
      throw e;
    });
  }
  return g.__seoMongo;
}

/** For pages: null when no database is configured (they show setup instructions). */
export async function dbOrNull(): Promise<Db | null> {
  try {
    return await getDb();
  } catch (e) {
    if (e instanceof DatabaseUnavailableError) return null;
    throw e;
  }
}

/** True when published values may exist (the public site skips the read otherwise). */
export function databaseConfigured(): boolean {
  if (process.env.MONGODB_URI?.trim()) return true;
  return process.env.NODE_ENV !== "production" && existsSync(LOCAL_DATA_DIR);
}

/**
 * Runs `fn` in a multi-document transaction when the deployment supports it;
 * otherwise runs it directly (callers then rely on per-document atomic writes).
 */
export async function withTransaction<T>(db: Db, fn: (session: ClientSession | undefined) => Promise<T>): Promise<T> {
  if (!db.transactions) return fn(undefined);
  const session = db.client.startSession();
  try {
    let result: T;
    await session.withTransaction(async (s) => {
      result = await fn(s);
    });
    return result!;
  } finally {
    await session.endSession();
  }
}
