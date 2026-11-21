import "server-only";
import { LIBRARY_SRCS } from "../content/library.ts";
import { siteUrl } from "../seo/env.ts";
import type { PostContext } from "./post.ts";

export const postContext = (): PostContext => ({ site: siteUrl(), library: LIBRARY_SRCS });
