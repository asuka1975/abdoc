import { describe, expect, test } from "vitest";
import {
  applyVariant,
  assignVariant,
  createVariantStore,
  DEFAULT_RATIO,
  parseRatio,
  pickVariant,
  storageKey,
  type StorageLike,
} from "../src/lib/variant";

/** テスト用の `localStorage` 相当（Map ベース） */
function memoryStorage(initial: Record<string, string> = {}): StorageLike & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

/** 常に例外を投げる `localStorage`（Safari のプライベートモードやストレージ無効化を想定） */
const throwingStorage: StorageLike = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("QuotaExceededError");
  },
};

describe("storageKey", () => {
  test("記事ごとのキー abdoc:variant:<slug>", () => {
    expect(storageKey("hello")).toBe("abdoc:variant:hello");
  });
});

describe("pickVariant（AC5）", () => {
  test("ratio 0.7: r < 0.7 なら A、r >= 0.7 なら B", () => {
    expect(pickVariant(0.7, 0)).toBe("A");
    expect(pickVariant(0.7, 0.6999999)).toBe("A");
    expect(pickVariant(0.7, 0.7)).toBe("B");
    expect(pickVariant(0.7, 0.7000001)).toBe("B");
    expect(pickVariant(0.7, 0.9999999)).toBe("B");
  });

  test("ratio 0 なら常に B", () => {
    for (const r of [0, 0.5, 0.9999999]) expect(pickVariant(0, r)).toBe("B");
  });

  test("ratio 1 なら常に A", () => {
    for (const r of [0, 0.5, 0.9999999]) expect(pickVariant(1, r)).toBe("A");
  });
});

describe("parseRatio（AC5: 省略時 0.5）", () => {
  test("省略・空・不正値は 0.5", () => {
    expect(DEFAULT_RATIO).toBe(0.5);
    expect(parseRatio(undefined)).toBe(0.5);
    expect(parseRatio("")).toBe(0.5);
    expect(parseRatio("abc")).toBe(0.5);
    expect(parseRatio("-0.1")).toBe(0.5);
    expect(parseRatio("1.1")).toBe(0.5);
  });

  test("0〜1 の数値はそのまま", () => {
    expect(parseRatio("0")).toBe(0);
    expect(parseRatio("0.7")).toBe(0.7);
    expect(parseRatio("1")).toBe(1);
  });
});

describe("assignVariant", () => {
  test("AC1: 未保存で抽選が A 側 → A を返し abdoc:variant:<slug> に A を保存", () => {
    const storage = memoryStorage();
    const store = createVariantStore(() => storage);

    expect(assignVariant("hello", 0.5, { store, random: () => 0.1 })).toBe("A");
    expect(storage.data.get("abdoc:variant:hello")).toBe("A");
  });

  test("AC2: 未保存で抽選が B 側 → B を返し B を保存", () => {
    const storage = memoryStorage();
    const store = createVariantStore(() => storage);

    expect(assignVariant("hello", 0.5, { store, random: () => 0.9 })).toBe("B");
    expect(storage.data.get("abdoc:variant:hello")).toBe("B");
  });

  test("AC3: 保存済みなら乱数・ratio に関係なく同じ版", () => {
    const storageA = memoryStorage({ "abdoc:variant:hello": "A" });
    const storeA = createVariantStore(() => storageA);
    // ratio 0 は本来常に B だが、保存済みの A を優先する
    expect(assignVariant("hello", 0, { store: storeA, random: () => 0.99 })).toBe("A");
    expect(assignVariant("hello", 0.5, { store: storeA, random: () => 0.99 })).toBe("A");

    const storageB = memoryStorage({ "abdoc:variant:hello": "B" });
    const storeB = createVariantStore(() => storageB);
    expect(assignVariant("hello", 1, { store: storeB, random: () => 0 })).toBe("B");
    expect(storageB.data.get("abdoc:variant:hello")).toBe("B");
  });

  test("AC3: 保存値が不正なら未保存とみなして抽選し直し、上書きする", () => {
    const storage = memoryStorage({ "abdoc:variant:hello": "C" });
    const store = createVariantStore(() => storage);

    expect(assignVariant("hello", 0.5, { store, random: () => 0.9 })).toBe("B");
    expect(storage.data.get("abdoc:variant:hello")).toBe("B");
  });

  test("AC4: 記事 X の保存値は記事 Y の抽選に影響せず、X の保存値も変わらない", () => {
    const storage = memoryStorage({ "abdoc:variant:x": "A" });
    const store = createVariantStore(() => storage);

    expect(assignVariant("y", 0.5, { store, random: () => 0.9 })).toBe("B");
    expect(storage.data.get("abdoc:variant:y")).toBe("B");
    expect(storage.data.get("abdoc:variant:x")).toBe("A");
  });

  test("AC5: 抽選は記事の ratio を使う", () => {
    const store = createVariantStore(() => memoryStorage());
    expect(assignVariant("a", 0.7, { store, random: () => 0.69 })).toBe("A");
    expect(assignVariant("b", 0.7, { store, random: () => 0.7 })).toBe("B");
  });

  test("AC9: localStorage が例外を投げても、エラーにならずメモリ上で割り当てを保つ", () => {
    const store = createVariantStore(() => throwingStorage);

    expect(assignVariant("hello", 0.5, { store, random: () => 0.1 })).toBe("A");
    // 同じページ内での再割り当ては同じ版（メモリ上の割り当て）
    expect(assignVariant("hello", 0.5, { store, random: () => 0.9 })).toBe("A");
  });

  test("AC9: localStorage の取得自体が例外・undefined でも動く", () => {
    const throwingGetter = createVariantStore(() => {
      throw new Error("SecurityError");
    });
    expect(assignVariant("hello", 0.5, { store: throwingGetter, random: () => 0.9 })).toBe("B");

    const missing = createVariantStore(() => undefined);
    expect(assignVariant("hello", 0.5, { store: missing, random: () => 0.1 })).toBe("A");
  });
});

describe("applyVariant（AC1・AC2・AC9: 片方だけ表示）", () => {
  test("A のとき A だけが可視", () => {
    const a = { hidden: true };
    const b = { hidden: true };
    applyVariant({ A: a, B: b }, "A");
    expect(a.hidden).toBe(false);
    expect(b.hidden).toBe(true);
  });

  test("B のとき B だけが可視", () => {
    const a = { hidden: true };
    const b = { hidden: false };
    applyVariant({ A: a, B: b }, "B");
    expect(a.hidden).toBe(true);
    expect(b.hidden).toBe(false);
  });
});
