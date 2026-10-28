import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { expect, test } from "vitest";
import Privacy from "../src/pages/privacy.astro";

async function render() {
  const container = await AstroContainer.create();
  return container.renderToString(Privacy);
}

test("AC4: /privacy/ に見出しとタイトルがあり、共通 Layout に載る", async () => {
  const html = await render();
  expect(html).toContain("<title>プライバシーポリシー | ABDOC</title>");
  expect(html).toMatch(/<h1[^>]*>プライバシーポリシー<\/h1>/);
  expect(html).toMatch(/data-consent-banner/);
});

test("AC4: Cookie の名前・目的・期限と、期限切れで版とリアクションがリセットされること", async () => {
  const html = await render();
  expect(html).toContain("abdoc_vid");
  expect(html).toContain("1 年");
  expect(html).toMatch(/期限が切れると新しい訪問者 ID[\s\S]*版[\s\S]*リアクションはリセット/);
});

test("AC4: 取得項目・保存先・保存期間・問い合わせ先（未定は TODO）", async () => {
  const html = await render();
  for (const item of ["訪問者 ID", "版", "リアクション", "スクロール深さ", "滞在時間"]) {
    expect(html).toContain(item);
  }
  expect(html).toContain("Google Cloud");
  expect(html).toContain("生ログの保存期間は 1 年");
  expect(html).toMatch(/お問い合わせ<\/h2>[\s\S]*TODO/);
  expect(html).toMatch(/運営者: TODO/);
});
