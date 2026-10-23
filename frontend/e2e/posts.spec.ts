import { expect, type Page, test } from "@playwright/test";

/** ページのスクリプトより先に `Math.random` を固定する */
async function fixRandom(page: Page, value: number) {
  await page.addInitScript((r) => {
    Math.random = () => r;
  }, value);
}

function variant(page: Page, name: "A" | "B") {
  return page.locator(`[data-variant="${name}"]`);
}

async function stored(page: Page, slug: string) {
  return page.evaluate((key) => window.localStorage.getItem(key), `abdoc:variant:${slug}`);
}

test("AC1: 未保存で抽選が A 側なら A だけが見え、A が保存される", async ({ page }) => {
  await fixRandom(page, 0.1);
  await page.goto("/posts/welcome/");

  await expect(variant(page, "A")).toBeVisible();
  await expect(variant(page, "B")).toBeHidden();
  await expect(page.getByRole("heading", { level: 1, name: "ABDOC へようこそ" })).toBeVisible();
  await expect(page).toHaveTitle("ABDOC へようこそ");
  expect(await stored(page, "welcome")).toBe("A");
});

test("AC2: 別の訪問者で抽選が B 側なら B だけが見え、B が保存される", async ({ page }) => {
  await fixRandom(page, 0.9);
  await page.goto("/posts/welcome/");

  await expect(variant(page, "B")).toBeVisible();
  await expect(variant(page, "A")).toBeHidden();
  await expect(page.getByRole("heading", { level: 1, name: "ABDOC とは" })).toBeVisible();
  await expect(page).toHaveTitle("ABDOC とは");
  expect(await stored(page, "welcome")).toBe("B");
});

test("AC3: 保存済みの版はリロード・再訪で乱数に関係なく同じ", async ({ page }) => {
  await page.addInitScript(() => {
    // 1 回目は A 側、以降は B 側に出る乱数
    const first = !sessionStorage.getItem("abdoc-e2e-visited");
    sessionStorage.setItem("abdoc-e2e-visited", "1");
    Math.random = () => (first ? 0.1 : 0.9);
  });
  await page.goto("/posts/welcome/");
  await expect(variant(page, "A")).toBeVisible();

  await page.reload();
  await expect(variant(page, "A")).toBeVisible();
  await expect(variant(page, "B")).toBeHidden();

  await page.goto("/");
  await page.goto("/posts/welcome/");
  await expect(variant(page, "A")).toBeVisible();
  await expect(variant(page, "B")).toBeHidden();
  expect(await stored(page, "welcome")).toBe("A");
});

test("AC3: 保存済みの B は ratio 0.7 の記事で A 側の乱数が出ても B のまま", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("abdoc:variant:getting-started", "B"));
  await fixRandom(page, 0);
  await page.goto("/posts/getting-started/");

  await expect(variant(page, "B")).toBeVisible();
  await expect(variant(page, "A")).toBeHidden();
});

test("AC4: 記事 X の割り当ては記事 Y に影響せず、Y は独立に抽選・保存される", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("abdoc:variant:welcome", "A"));
  await fixRandom(page, 0.9);

  await page.goto("/posts/getting-started/");
  await expect(variant(page, "B")).toBeVisible();
  await expect(variant(page, "A")).toBeHidden();
  expect(await stored(page, "getting-started")).toBe("B");
  expect(await stored(page, "welcome")).toBe("A");
});

test("AC5: ratio 0.7 の記事は r = 0.69 で A、r = 0.7 で B", async ({ browser }) => {
  for (const [r, expected] of [
    [0.69, "A"],
    [0.7, "B"],
  ] as const) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await fixRandom(page, r);
    await page.goto("/posts/getting-started/");
    await expect(variant(page, expected)).toBeVisible();
    expect(await stored(page, "getting-started")).toBe(expected);
    await context.close();
  }
});

test("AC7: 記事ページの表示・操作でバックエンド（/api/**）へのリクエストが発生しない", async ({ page }) => {
  const apiRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/")) apiRequests.push(request.url());
  });

  await page.goto("/posts/welcome/");
  await expect(page.locator("[data-variant]:visible")).toHaveCount(1);
  await page.reload();
  await page.goto("/posts/getting-started/");
  await expect(page.locator("[data-variant]:visible")).toHaveCount(1);
  await page.waitForLoadState("networkidle");

  expect(apiRequests).toEqual([]);
});

test.describe("JS 無効", () => {
  test.use({ javaScriptEnabled: false });

  test("A を表示する", async ({ page }) => {
    await page.goto("/posts/welcome/");
    await expect(variant(page, "A")).toBeVisible();
    await expect(variant(page, "B")).toBeHidden();
  });
});
