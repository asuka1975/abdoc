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
