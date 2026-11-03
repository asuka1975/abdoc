import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { expect, test } from "vitest";
import ConsentBanner from "../src/components/ConsentBanner.astro";
import BaseLayout from "../src/layouts/BaseLayout.astro";

function banner(html: string) {
  const match = html.match(/<section[^>]*data-consent-banner[^>]*>[\s\S]*?<\/section>/);
  if (!match) throw new Error("同意バナーが見つからない");
  return match[0];
}

test("AC3・AC4: バナーは「同意する」「拒否する」の 2 ボタンとプライバシーポリシーへのリンクを持つ", async () => {
  const container = await AstroContainer.create();
  const html = banner(await container.renderToString(ConsentBanner));

  expect(html).toMatch(/<button[^>]*type="button"[^>]*data-consent-choice="granted"[^>]*>同意する<\/button>/);
  expect(html).toMatch(/<button[^>]*type="button"[^>]*data-consent-choice="denied"[^>]*>拒否する<\/button>/);
  expect(html).toMatch(/<a[^>]*href="\/privacy\/"[^>]*>プライバシーポリシー<\/a>/);
  expect(html).toMatch(/aria-labelledby="consent-title"/);
});

test("AC3: バナーは初期状態で hidden（未選択のときだけスクリプトが出す。JS 無効時は出さない）", async () => {
  const container = await AstroContainer.create();
  const html = banner(await container.renderToString(ConsentBanner));
  expect(html.slice(0, html.indexOf(">") + 1)).toMatch(/\shidden[\s>]/);
});

test("AC3: 共通 Layout はフッターに選び直しのボタンとポリシーへのリンクを持ち、バナーを含む", async () => {
  const container = await AstroContainer.create();
  const html = await container.renderToString(BaseLayout, { props: { title: "t" } });

  const footer = html.match(/<footer[^>]*>[\s\S]*?<\/footer>/)?.[0] ?? "";
  expect(footer).toMatch(/<a[^>]*href="\/privacy\/"[^>]*>プライバシーポリシー<\/a>/);
  expect(footer).toMatch(/<button[^>]*type="button"[^>]*data-consent-open[^>]*>Cookie の設定<\/button>/);
  expect(html).toMatch(/data-consent-banner/);
  expect(html).toContain("<title>t</title>");
  expect(html).toContain('<html lang="ja"');
});
