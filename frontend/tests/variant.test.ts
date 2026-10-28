import { randomUUID } from "node:crypto";
import { describe, expect, test } from "vitest";
import { applyVariant, assignVariant, DEFAULT_RATIO, fnv1a32, parseRatio, pickVariant } from "../src/lib/variant";

describe("fnv1a32", () => {
  test("既知のテストベクタ（32 bit FNV-1a）", () => {
    expect(fnv1a32("")).toBe(0x811c9dc5);
    expect(fnv1a32("a")).toBe(0xe40c292c);
    expect(fnv1a32("foobar")).toBe(0xbf9cf968);
  });

  test("非 ASCII は UTF-8 のバイト列としてハッシュする", () => {
    // "é" = 0xC3 0xA9
    let hash = 0x811c9dc5;
    for (const byte of [0xc3, 0xa9]) hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
    expect(fnv1a32("é")).toBe(hash);
  });
});

describe("pickVariant", () => {
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

describe("parseRatio（省略時 0.5）", () => {
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
  const id = "3f2b8c1e-5d4a-4e6b-9c7d-1a2b3c4d5e6f";

  test("AC1: 同じ訪問者 ID と slug の組なら何度割り当てても同じ版", () => {
    for (const ratio of [0.3, 0.5, 0.7]) {
      const first = assignVariant(id, "hello", ratio);
      for (let i = 0; i < 100; i++) expect(assignVariant(id, "hello", ratio)).toBe(first);
    }
  });

  test("AC1: FNV-1a32(\"<visitorId>:<slug>\") / 2^32 < ratio なら A", () => {
    const r = fnv1a32(`${id}:hello`) / 2 ** 32;
    expect(assignVariant(id, "hello", r)).toBe("B");
    expect(assignVariant(id, "hello", r + 1e-9)).toBe("A");
  });

  test("AC1: 記事が違えば訪問者 ID が同じでも独立に決まる（slug をハッシュに含める）", () => {
    const r = (slug: string) => fnv1a32(`${id}:${slug}`) / 2 ** 32;
    expect(r("x")).not.toBe(r("y"));
    expect(assignVariant(id, "x", 0.5)).toBe(pickVariant(0.5, r("x")));
    expect(assignVariant(id, "y", 0.5)).toBe(pickVariant(0.5, r("y")));
  });

  test.each([0, 0.5, 1])("AC1: ランダムな ID 1 万件で A の割合が ratio %s ±2%", (ratio) => {
    const n = 10_000;
    let a = 0;
    for (let i = 0; i < n; i++) if (assignVariant(randomUUID(), "hello", ratio) === "A") a++;
    expect(Math.abs(a / n - ratio)).toBeLessThanOrEqual(0.02);
  });
});

describe("applyVariant（片方だけ表示）", () => {
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
