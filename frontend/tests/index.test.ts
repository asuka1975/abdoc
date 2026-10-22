import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { expect, test } from "vitest";
import Index from "../src/pages/index.astro";

test("トップページのタイトルと見出しが ABDOC", async () => {
  const container = await AstroContainer.create();
  const html = await container.renderToString(Index);

  expect(html).toContain("<title>ABDOC</title>");
  expect(html).toMatch(/<h1[^>]*>ABDOC<\/h1>/);
  expect(html).toContain('<html lang="ja"');
});
