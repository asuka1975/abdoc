import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { variantASchema, variantBSchema } from "./lib/post-schema";

const base = "./src/content/posts";
/** `<slug>/a.md` → `<slug>`。A と B を同じ ID で引けるようにする */
const slugOf = ({ entry }: { entry: string }) => entry.split("/")[0] ?? entry;

/** 記事のバリエーション A（`src/content/posts/<slug>/a.md`）。比率 `ratio` はこちらにだけ書く */
const postsA = defineCollection({
  loader: glob({ base, pattern: "*/a.md", generateId: slugOf }),
  schema: variantASchema,
});

/** 記事のバリエーション B（`src/content/posts/<slug>/b.md`） */
const postsB = defineCollection({
  loader: glob({ base, pattern: "*/b.md", generateId: slugOf }),
  schema: variantBSchema,
});

export const collections = { postsA, postsB };
