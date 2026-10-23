import { ESLint } from "eslint";
import { expect, test } from "vitest";

test("ESLint の a11y ルールが alt の無い img を検出する", async () => {
  const eslint = new ESLint();
  const [result] = await eslint.lintText('---\n---\n<img src="/x.png" />\n', {
    filePath: "src/pages/a11y-probe.astro",
  });

  const ruleIds = result?.messages.map((m) => m.ruleId);
  expect(ruleIds).toContain("astro/jsx-a11y/alt-text");
});
