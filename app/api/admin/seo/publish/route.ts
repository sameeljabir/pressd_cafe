import { handle, ok } from "@/lib/seo/api";
import { getDb, siteUrl } from "@/lib/seo/server";
import { logAdmin } from "@/lib/seo/services/log";
import { pendingChanges, publishAll } from "@/lib/seo/services/docs";
import { getSettings } from "@/lib/seo/services/settings";
import { codeDefaults, expectedLive, refreshPublicPage } from "@/lib/seo/services/verify";

// What "Confirm & Publish" would change (drafts that differ from the live site).
export const GET = handle("reports:read", async () => {
  const db = await getDb();
  const pending = await pendingChanges(db, codeDefaults(), (await getSettings(db)).thresholds, siteUrl());
  return ok({ pending });
});

// Confirm & Publish: every saved draft goes live together (all validated first).
export const POST = handle("metadata:publish", async (_req, viewer) => {
  const db = await getDb();
  const changes = await publishAll(db, viewer.email, codeDefaults(), (await getSettings(db)).thresholds, siteUrl());
  refreshPublicPage("/");
  await logAdmin(db, viewer.email, "published", null, { documents: changes.map((c) => `${c.key}@v${c.version}`) });
  return ok({ changes, expected: await expectedLive(db) }, 201);
});
