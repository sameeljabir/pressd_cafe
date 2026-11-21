import { handle, ok, readJson } from "@/lib/seo/api";
import { getDb } from "@/lib/seo/server";
import { addCategory, getCategories, removeCategory } from "@/lib/blog/service";

export const GET = handle("reports:read", async () => ok({ categories: await getCategories(await getDb()) }));
export const POST = handle("content:draft", async (req, viewer) => {
  const { name } = await readJson(req, 2_000);
  return ok({ categories: await addCategory(await getDb(), name, viewer.email) }, 201);
});
export const DELETE = handle("content:publish", async (req, viewer) => {
  const { name } = await readJson(req, 2_000);
  return ok({ categories: await removeCategory(await getDb(), name, viewer.email) });
});
