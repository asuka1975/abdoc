import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { expect, test } from "vitest";
import ABPost from "../src/components/ABPost.astro";
import * as gettingStartedA from "../src/content/posts/getting-started/a.md";
import * as welcomeA from "../src/content/posts/welcome/a.md";
import * as welcomeB from "../src/content/posts/welcome/b.md";

/** サンプル記事の Markdown を Astro で HTML にして、記事ページと同じくスロット a / b に渡す */
async function renderWelcome(ratio = 0.5) {
  const container = await AstroContainer.create();
  return container.renderToString(ABPost, {
    props: { slug: "welcome", ratio, titleA: welcomeA.frontmatter.title, titleB: welcomeB.frontmatter.title },
    slots: {
      a: await container.renderToString(welcomeA.Content),
      b: await container.renderToString(welcomeB.Content),
    },
  });
}

function article(html: string, variant: "A" | "B") {
  const match = html.match(new RegExp(`<article[^>]*data-variant="${variant}"[^>]*>([\\s\\S]*?)</article>`));
  if (!match) throw new Error(`版 ${variant} が見つからない`);
  return { tag: match[0].slice(0, match[0].indexOf(">") + 1), body: match[1] };
}

test("AC8: 両版が Markdown からレンダリングされて HTML に含まれ、初期状態は両方 hidden", async () => {
  const html = await renderWelcome();
  const a = article(html, "A");
  const b = article(html, "B");

  expect(a.tag).toMatch(/\shidden[\s>]/);
  expect(b.tag).toMatch(/\shidden[\s>]/);
  expect(a.body).toMatch(/<h1[^>]*>ABDOC へようこそ<\/h1>/);
  expect(a.body).toContain("<strong>A</strong>");
  expect(b.body).toMatch(/<h1[^>]*>ABDOC とは<\/h1>/);
  expect(b.body).toMatch(/<h2[^>]*>何ができるか<\/h2>/);
  expect(b.body).toContain("<li>");
  expect(b.body).toContain("<strong>B</strong>");
});

test("AC8: slug と比率が data-* 属性に出力される", async () => {
  const html = await renderWelcome(0.7);
  expect(html).toMatch(/<main[^>]*data-slug="welcome"/);
  expect(html).toMatch(/<main[^>]*data-ratio="0.7"/);
});

test("AC8: サンプル記事の ratio（0.7 / 省略）", () => {
  expect(gettingStartedA.frontmatter.ratio).toBe(0.7);
  expect(welcomeA.frontmatter.ratio).toBeUndefined();
});

test("記事ページは共通 Layout に載り、フッターと同意バナーを持つ", async () => {
  const html = await renderWelcome();
  expect(html).toContain("<title>ABDOC へようこそ</title>");
  expect(html).toMatch(/<footer[^>]*>[\s\S]*href="\/privacy\/"[\s\S]*<\/footer>/);
  expect(html).toMatch(/data-consent-banner/);
});

test("JS 無効時は noscript で A を表示する", async () => {
  const html = await renderWelcome();
  expect(html).toMatch(/<noscript>[\s\S]*\[data-variant="A"\]\[hidden\][\s\S]*display:\s*block[\s\S]*<\/noscript>/);
});

test("#26 AC5/AC6: 評価ボタンは aria-pressed を持ち、初期は disabled で同意の案内文を出す（JS が動くまで hidden）", async () => {
  const html = await renderWelcome();
  const section = html.match(/<section[^>]*data-reaction[\s>][\s\S]*?<\/section>/)?.[0];
  if (!section) throw new Error("評価ボタンの section が見つからない");

  expect(section.slice(0, section.indexOf(">") + 1)).toMatch(/\shidden[\s>]/);
  expect(section).toMatch(/aria-label="この記事の評価"/);
  for (const name of ["like", "bad"]) {
    const button = section.match(new RegExp(`<button[^>]*data-reaction-button="${name}"[^>]*>`))?.[0] ?? "";
    expect(button).toMatch(/type="button"/);
    expect(button).toMatch(/aria-pressed="false"/);
    expect(button).toMatch(/\sdisabled[\s>]/);
  }
  expect(section).toMatch(/いいね <span[^>]*data-reaction-count="like"[^>]*aria-live="polite"/);
  expect(section).toMatch(/バッド <span[^>]*data-reaction-count="bad"[^>]*aria-live="polite"/);
  expect(section).toContain("Cookie に同意すると評価できます");
  // 評価ボタンは記事の本体（main）の中に 1 つだけ
  expect(html.match(/<section[^>]*data-reaction[\s>]/g)).toHaveLength(1);
  expect(html).toMatch(/<main[^>]*>[\s\S]*data-reaction[\s\S]*<\/main>/);
});
