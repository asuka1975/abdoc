import { describe, expect, test } from "vitest";
import { variantASchema, variantBSchema } from "../src/lib/post-schema";

describe("a.md の frontmatter（AC5・AC6）", () => {
  test("ratio を省略すると 0.5", () => {
    expect(variantASchema.parse({ title: "t" }).ratio).toBe(0.5);
  });

  test.each([0, 0.7, 1])("ratio: %s は有効", (ratio) => {
    expect(variantASchema.parse({ title: "t", ratio }).ratio).toBe(ratio);
  });

  test.each([["数値以外", "0.7"], ["数値以外", true], ["< 0", -0.01], ["> 1", 1.01], ["NaN", Number.NaN]])(
    "ratio が %s（%s）ならエラー",
    (_label, ratio) => {
      expect(variantASchema.safeParse({ title: "t", ratio }).success).toBe(false);
    },
  );
});

describe("b.md の frontmatter（AC6）", () => {
  test("ratio が無ければ有効", () => {
    expect(variantBSchema.safeParse({ title: "t" }).success).toBe(true);
  });

  test.each([0.5, 0, "0.5"])("ratio: %s を書くとエラー", (ratio) => {
    const result = variantBSchema.safeParse({ title: "t", ratio });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain("a.md");
  });
});
