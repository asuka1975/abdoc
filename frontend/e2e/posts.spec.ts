import { type BrowserContext, expect, type Page, test } from "@playwright/test";
import { assignVariant, type Variant } from "../src/lib/variant";

const RATIO = { welcome: 0.5, "getting-started": 0.7 } as const;
type Slug = keyof typeof RATIO;

/** `slug` で `variant` が割り当てられる訪問者 ID を、決まった列から探す */
function idFor(slug: Slug, variant: Variant, skip = 0): string {
  let found = 0;
  for (let i = 0; i < 10_000; i++) {
    const id = `00000000-0000-4000-8000-${i.toString(16).padStart(12, "0")}`;
    if (assignVariant(id, slug, RATIO[slug]) === variant && found++ === skip) return id;
  }
  throw new Error(`${slug} で ${variant} になる ID が見つからない`);
}

/** 同意済みで、訪問者 ID `id` の Cookie を持つ訪問者にする */
async function grantedVisitor(context: BrowserContext, id: string) {
  await context.addInitScript(() => localStorage.setItem("abdoc:consent", "granted"));
  await context.addCookies([
    { name: "abdoc_vid", value: id, url: "http://localhost:4321", secure: true, sameSite: "Lax" },
  ]);
}

function variant(page: Page, name: Variant) {
  return page.locator(`[data-variant="${name}"]`);
}

async function variantKeys(page: Page) {
  return page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("abdoc:variant:")));
}

test("AC1: 訪問者 ID が A に割り当たる組なら A だけが見え、版は localStorage に保存しない", async ({ page, context }) => {
  await grantedVisitor(context, idFor("welcome", "A"));
  await page.goto("/posts/welcome/");

  await expect(variant(page, "A")).toBeVisible();
  await expect(variant(page, "B")).toBeHidden();
  await expect(page.getByRole("heading", { level: 1, name: "ABDOC へようこそ" })).toBeVisible();
  await expect(page).toHaveTitle("ABDOC へようこそ");
  expect(await variantKeys(page)).toEqual([]);
});

test("AC1: 別の訪問者 ID で B に割り当たる組なら B だけが見える", async ({ page, context }) => {
  await grantedVisitor(context, idFor("welcome", "B"));
  await page.goto("/posts/welcome/");

  await expect(variant(page, "B")).toBeVisible();
  await expect(variant(page, "A")).toBeHidden();
  await expect(page.getByRole("heading", { level: 1, name: "ABDOC とは" })).toBeVisible();
  await expect(page).toHaveTitle("ABDOC とは");
  expect(await variantKeys(page)).toEqual([]);
});

test("AC1: 同じ訪問者 ID ならリロード・再訪でも同じ版", async ({ page, context }) => {
  await grantedVisitor(context, idFor("welcome", "A"));
  await page.goto("/posts/welcome/");
  await expect(variant(page, "A")).toBeVisible();

  await page.reload();
  await expect(variant(page, "A")).toBeVisible();
  await expect(variant(page, "B")).toBeHidden();

  await page.goto("/");
  await page.goto("/posts/welcome/");
  await expect(variant(page, "A")).toBeVisible();
  await expect(variant(page, "B")).toBeHidden();
});

test("AC7: 古い abdoc:variant:<slug> が残っていても無視し、訪問者 ID から決まる版を出す", async ({ page, context }) => {
  await context.addInitScript(() => localStorage.setItem("abdoc:variant:getting-started", "A"));
  await grantedVisitor(context, idFor("getting-started", "B"));
  await page.goto("/posts/getting-started/");

  await expect(variant(page, "B")).toBeVisible();
  await expect(variant(page, "A")).toBeHidden();
});

test("AC1: 記事ごとに独立して決まる（同じ ID でも記事 X と Y で版が違いうる）", async ({ page, context }) => {
  // welcome では A、getting-started では B になる ID
  let id = "";
  for (let skip = 0; !id; skip++) {
    const candidate = idFor("welcome", "A", skip);
    if (assignVariant(candidate, "getting-started", RATIO["getting-started"]) === "B") id = candidate;
  }
  await grantedVisitor(context, id);

  await page.goto("/posts/getting-started/");
  await expect(variant(page, "B")).toBeVisible();
  await expect(variant(page, "A")).toBeHidden();
  await page.goto("/posts/welcome/");
  await expect(variant(page, "A")).toBeVisible();
  await expect(variant(page, "B")).toBeHidden();
});

test("AC1: ratio 0.7 の記事は FNV-1a32 / 2^32 < 0.7 なら A、それ以外は B", async ({ browser }) => {
  for (const expected of ["A", "B"] as const) {
    const context = await browser.newContext();
    await grantedVisitor(context, idFor("getting-started", expected));
    const page = await context.newPage();
    await page.goto("/posts/getting-started/");
    await expect(variant(page, expected)).toBeVisible();
    await context.close();
  }
});

test("記事ページの表示・操作でバックエンド（/api/**）へのリクエストが発生しない", async ({ page }) => {
  const apiRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/")) apiRequests.push(request.url());
  });

  await page.goto("/posts/welcome/");
  await expect(page.locator("[data-variant]:visible")).toHaveCount(1);
  await page.getByRole("button", { name: "同意する" }).click();
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
