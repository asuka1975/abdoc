/**
 * A/B 記事の frontmatter スキーマ（ビルド時に `src/content.config.ts` が使う）。
 * クライアントに zod を持ち込まないよう、`variant.ts` とは分けている。
 */
import { z } from "astro/zod";
import { DEFAULT_RATIO } from "./variant";

/** `a.md`: `ratio` は A が選ばれる確率（0 以上 1 以下）。省略時は 0.5 */
export const variantASchema = z.object({
  title: z.string(),
  ratio: z.number().min(0).max(1).default(DEFAULT_RATIO),
});

/** `b.md`: 比率を書く場所を a.md の 1 か所に限るため、`ratio` があればエラーにする */
export const variantBSchema = z.object({
  title: z.string(),
  ratio: z.never({ error: "ratio は a.md の frontmatter にだけ書けます（b.md には書けません）" }).optional(),
});
