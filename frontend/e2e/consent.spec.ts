import { expect, type Page, test } from "@playwright/test";
import { assignVariant } from "../src/lib/variant";

function banner(page: Page) {
  return page.getByRole("region", { name: "Cookie の利用について" });
}

async function visitorCookie(page: Page) {
  return (await page.context().cookies()).find((cookie) => cookie.name === "abdoc_vid");
}

async function visibleVariant(page: Page) {
  return page.locator("[data-variant]:visible").getAttribute("data-variant");
}

test("AC2: 未同意のまま記事を表示しても abdoc_vid は書かれない", async ({ page }) => {
  await page.goto("/posts/welcome/");
  await expect(banner(page)).toBeVisible();
  await expect(page.locator("[data-variant]:visible")).toHaveCount(1);
  await page.reload();
  await expect(page.locator("[data-variant]:visible")).toHaveCount(1);

  expect(await visitorCookie(page)).toBeUndefined();
});

test("AC2: 拒否すると abdoc_vid は書かれず、記事は表示されたまま", async ({ page }) => {
  await page.goto("/posts/welcome/");
  const before = await visibleVariant(page);
  await banner(page).getByRole("button", { name: "拒否する" }).click();

  await expect(banner(page)).toBeHidden();
  expect(await visibleVariant(page)).toBe(before);
  expect(await visitorCookie(page)).toBeUndefined();
  await page.goto("/posts/getting-started/");
  await expect(page.locator("[data-variant]:visible")).toHaveCount(1);
  expect(await visitorCookie(page)).toBeUndefined();
});

test("AC2: 同意すると表示中の版のまま abdoc_vid が属性付きで書かれ、再訪でも同じ版", async ({ page }) => {
  for (const expected of ["A", "B"] as const) {
    let id = "";
    for (let i = 0; !id; i++) {
      const candidate = `00000000-0000-4000-8000-${i.toString(16).padStart(12, "0")}`;
      if (assignVariant(candidate, "welcome", 0.5) === expected) id = candidate;
    }
    await page.context().clearCookies();
    // 一時 ID を固定して、A と B のどちらの版で同意しても変わらないことを見る
    await page.addInitScript((value) => {
      localStorage.removeItem("abdoc:consent");
      crypto.randomUUID = () => value as `${string}-${string}-${string}-${string}-${string}`;
    }, id);
    await page.goto("/posts/welcome/");
    const before = await visibleVariant(page);
    expect(before).toBe(expected);

    const start = Date.now() / 1000;
    await banner(page).getByRole("button", { name: "同意する" }).click();

    expect(await visibleVariant(page)).toBe(before);
    const cookie = await visitorCookie(page);
    expect(cookie?.value).toBe(id);
    expect(cookie?.path).toBe("/");
    expect(cookie?.secure).toBe(true);
    expect(cookie?.sameSite).toBe("Lax");
    expect(cookie?.httpOnly).toBe(false);
    // Max-Age=31536000（1 年）
    expect(cookie?.expires).toBeGreaterThan(start + 31536000 - 60);
    expect(cookie?.expires).toBeLessThan(start + 31536000 + 60);
  }
});

test("AC2: 同意後は一時 ID でなく保存した ID で版が決まる（リロードしても同じ版）", async ({ page }) => {
  await page.goto("/posts/welcome/");
  await banner(page).getByRole("button", { name: "同意する" }).click();
  const chosen = await visibleVariant(page);
  const id = (await visitorCookie(page))?.value;

  for (let i = 0; i < 3; i++) {
    await page.reload();
    await expect(page.locator("[data-variant]:visible")).toHaveCount(1);
    expect(await visibleVariant(page)).toBe(chosen);
    expect((await visitorCookie(page))?.value).toBe(id);
  }
});

test("AC3: 同意を選ぶと再訪でバナーが出ず、フッターから選び直せる", async ({ page }) => {
  await page.goto("/");
  await banner(page).getByRole("button", { name: "同意する" }).click();
  await expect(banner(page)).toBeHidden();

  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "ABDOC" })).toBeVisible();
  await expect(banner(page)).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem("abdoc:consent"))).toBe("granted");

  // フッターから選び直す（拒否に変えると abdoc_vid を消す）
  await page.getByRole("contentinfo").getByRole("button", { name: "Cookie の設定" }).click();
  await expect(banner(page)).toBeVisible();
  await expect(banner(page).getByRole("button", { name: "同意する" })).toBeFocused();
  await banner(page).getByRole("button", { name: "拒否する" }).click();
  await expect(banner(page)).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem("abdoc:consent"))).toBe("denied");
  expect(await visitorCookie(page)).toBeUndefined();
});

test("AC3: 拒否を選ぶと再訪でバナーが出ない", async ({ page }) => {
  await page.goto("/posts/welcome/");
  await banner(page).getByRole("button", { name: "拒否する" }).click();

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "ABDOC" })).toBeVisible();
  await expect(banner(page)).toBeHidden();
  await page.goto("/posts/getting-started/");
  await expect(page.locator("[data-variant]:visible")).toHaveCount(1);
  await expect(banner(page)).toBeHidden();
});

test("AC4: どのページからもバナーのリンクで /privacy/ を開ける", async ({ page }) => {
  for (const path of ["/", "/posts/welcome/"]) {
    await page.goto(path);
    await banner(page).getByRole("link", { name: "プライバシーポリシー" }).click();
    await expect(page).toHaveURL("/privacy/");
    await expect(page.getByRole("heading", { level: 1, name: "プライバシーポリシー" })).toBeVisible();
    await expect(page).toHaveTitle("プライバシーポリシー | ABDOC");
    await expect(page.getByRole("cell", { name: "abdoc_vid" })).toBeVisible();
  }
});

test("AC4: フッターからも /privacy/ を開ける", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("contentinfo").getByRole("link", { name: "プライバシーポリシー" }).click();
  await expect(page).toHaveURL("/privacy/");
});
