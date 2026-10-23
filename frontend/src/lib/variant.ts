/**
 * A/B 記事の割り当て（クライアント側）。
 * 訪問者 × 記事ごとに A/B を抽選し、`localStorage` の `abdoc:variant:<slug>` に保存して固定する。
 * ブラウザ API には直接依存せず、ストレージと乱数を注入できるようにしてある（単体テストのため）。
 */

export type Variant = "A" | "B";

/** `a.md` の frontmatter で `ratio` を省略したときの A の確率 */
export const DEFAULT_RATIO = 0.5;

/** `localStorage` のうち、ここで使う部分だけ */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface VariantStore {
  get(slug: string): Variant | null;
  set(slug: string, variant: Variant): void;
}

export function storageKey(slug: string): string {
  return `abdoc:variant:${slug}`;
}

/** 乱数 `random`（0 ≤ r < 1）が `ratio` 未満なら A、それ以外は B */
export function pickVariant(ratio: number, random: number): Variant {
  return random < ratio ? "A" : "B";
}

/** `data-ratio` 属性の値を比率に変換する。省略・不正値は `DEFAULT_RATIO` */
export function parseRatio(value: string | undefined): number {
  if (value === undefined || value.trim() === "") return DEFAULT_RATIO;
  const ratio = Number(value);
  return Number.isFinite(ratio) && ratio >= 0 && ratio <= 1 ? ratio : DEFAULT_RATIO;
}

function parseVariant(value: string | null): Variant | null {
  return value === "A" || value === "B" ? value : null;
}

/**
 * 割り当ての保存先を作る。`localStorage` が使えない（取得や読み書きで例外になる・存在しない）ときは、
 * そのページを表示している間だけ有効なメモリ上の割り当てで動く。
 */
export function createVariantStore(getStorage: () => StorageLike | undefined): VariantStore {
  const memory = new Map<string, Variant>();
  let storage: StorageLike | undefined;
  try {
    storage = getStorage();
  } catch {
    storage = undefined;
  }

  return {
    get(slug) {
      const remembered = memory.get(slug);
      if (remembered) return remembered;
      try {
        return parseVariant(storage?.getItem(storageKey(slug)) ?? null);
      } catch {
        return null;
      }
    },
    set(slug, variant) {
      memory.set(slug, variant);
      try {
        storage?.setItem(storageKey(slug), variant);
      } catch {
        // 保存できなくてもメモリ上の割り当てで表示を続ける
      }
    },
  };
}

/** 保存済みならその版を、未保存（または不正値）なら `ratio` で抽選して保存した版を返す */
export function assignVariant(
  slug: string,
  ratio: number,
  deps: { store: VariantStore; random: () => number },
): Variant {
  const saved = deps.store.get(slug);
  if (saved) return saved;
  const variant = pickVariant(ratio, deps.random());
  deps.store.set(slug, variant);
  return variant;
}

/** 割り当てた版だけを表示し、もう片方を隠す */
export function applyVariant(elements: Record<Variant, Pick<HTMLElement, "hidden">>, variant: Variant): void {
  elements.A.hidden = variant !== "A";
  elements.B.hidden = variant !== "B";
}
