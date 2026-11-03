/**
 * A/B 記事の割り当て（クライアント側）。
 * 訪問者 ID と記事の slug から決定論的に版を決める: `FNV-1a32("<visitorId>:<slug>") / 2^32 < ratio` なら A。
 * 同じ訪問者 ID なら何度割り当てても同じ版になるので、版そのものは保存しない（訪問者 ID は `visitor.ts`）。
 */

export type Variant = "A" | "B";

/** `a.md` の frontmatter で `ratio` を省略したときの A の確率 */
export const DEFAULT_RATIO = 0.5;

/** 32 bit FNV-1a。文字列は UTF-8 のバイト列としてハッシュする */
export function fnv1a32(text: string): number {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** 0 ≤ r < 1 の値 `random` が `ratio` 未満なら A、それ以外は B */
export function pickVariant(ratio: number, random: number): Variant {
  return random < ratio ? "A" : "B";
}

/** `data-ratio` 属性の値を比率に変換する。省略・不正値は `DEFAULT_RATIO` */
export function parseRatio(value: string | undefined): number {
  if (value === undefined || value.trim() === "") return DEFAULT_RATIO;
  const ratio = Number(value);
  return Number.isFinite(ratio) && ratio >= 0 && ratio <= 1 ? ratio : DEFAULT_RATIO;
}

/** 訪問者 ID と slug から版を決める（同じ組なら常に同じ版） */
export function assignVariant(visitorId: string, slug: string, ratio: number): Variant {
  return pickVariant(ratio, fnv1a32(`${visitorId}:${slug}`) / 2 ** 32);
}

/** 割り当てた版だけを表示し、もう片方を隠す */
export function applyVariant(elements: Record<Variant, Pick<HTMLElement, "hidden">>, variant: Variant): void {
  elements.A.hidden = variant !== "A";
  elements.B.hidden = variant !== "B";
}
