// Real local MongoDB servers for the tests (mongodb-memory-server; binary cached
// after the first download). Nothing here talks to Atlas.
//  - replicaSetDb(): single-node replica set, like every Atlas cluster → transactions
//  - standaloneDb(): plain mongod → no transactions (the fallback write path)
import { after } from "node:test";
import { MongoMemoryReplSet, MongoMemoryServer } from "mongodb-memory-server-core";
import { openMongo, type Db } from "../../lib/seo/db/mongo.ts";

let rs: Promise<MongoMemoryReplSet> | undefined;
let single: Promise<MongoMemoryServer> | undefined;
const open: Db[] = [];
let n = 0;
const fresh = () => `pressd_seo_test_${process.pid}_${++n}`;

export async function replicaSetDb(): Promise<Db> {
  rs ??= MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
  const db = await openMongo((await rs).getUri(), fresh());
  open.push(db);
  return db;
}

export async function standaloneDb(): Promise<Db> {
  single ??= MongoMemoryServer.create();
  const db = await openMongo((await single).getUri(), fresh());
  open.push(db);
  return db;
}

/** Connection string of the replica set (for code that connects by itself). */
export async function replicaSetUri(dbName: string): Promise<string> {
  rs ??= MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
  return (await rs).getUri(dbName);
}

after(async () => {
  await Promise.all(open.map((d) => d.client.close().catch(() => {})));
  await Promise.all([rs?.then((s) => s.stop()), single?.then((s) => s.stop())]);
});
