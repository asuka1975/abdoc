import { type BrowserContext, expect, type Page, test } from "@playwright/test";
import { assignVariant, type Variant } from "../src/lib/variant";

const VID = "00000000-0000-4000-8000-000000000000";

/** welcome（ratio 0.5）で `variant` が割り当てられる訪問者 ID */
function idFor(variant: Variant): string {
  for (let i = 0; i < 10_000; i++) {
    const id = `00000000-0000-4000-8000-${i.toString(16).padStart(12, "0")}`;
    if (assignVariant(id, "welcome", 0.5) === variant) return id;
  }
  throw new Error(`${variant} になる ID が見つからない`);
}

async function grantedVisitor(context: BrowserContext, id: string) {
  await context.addInitScript(() => localStorage.setItem("abdoc:consent", "granted"));
  await context.addCookies([
    { name: "abdoc_vid", value: id, url: "http://localhost:4321", secure: true, sameSite: "Lax" },
  ]);
}

interface ApiCall {
  method: string;
  path: string;
  query: URLSearchParams;
  visitorId: string | undefined;
  body: unknown;
}

/** `/api/**` を BE の代わりに受ける。リアクションは BE と同じ規則で数える */
async function mockApi(page: Page, initial = { likes: 3, bads: 1, myReaction: "none" }) {
  const calls: ApiCall[] = [];
  const state = { ...initial };
  // 離脱中のページが出す keepalive のリクエストも受けるため、ページでなくコンテキストで受ける
  await page.context().route(
    (url) => url.pathname.startsWith("/api/"),
    async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const raw = request.postData();
      const call: ApiCall = {
        method: request.method(),
        path: url.pathname,
        query: url.searchParams,
        visitorId: await request.headerValue("x-abdoc-visitor-id").then((v) => v ?? undefined),
        body: raw ? (JSON.parse(raw) as unknown) : undefined,
      };
      calls.push(call);
      if (call.path.endsWith("/engagement")) return route.fulfill({ status: 204 });
      if (call.method === "PUT") {
        const { reaction } = call.body as { reaction: string };
        if (state.myReaction === "like") state.likes--;
        if (state.myReaction === "bad") state.bads--;
        if (reaction === "like") state.likes++;
        if (reaction === "bad") state.bads++;
        state.myReaction = reaction;
      }
      return route.fulfill({ json: state });
    },
  );
  return calls;
}

function reaction(page: Page) {
  const section = page.getByRole("region", { name: "この記事の評価" });
  return {
    section,
    like: section.getByRole("button", { name: /いいね/ }),
    bad: section.getByRole("button", { name: /バッド/ }),
    notice: section.getByText("Cookie に同意すると評価できます"),
  };
}

function banner(page: Page) {
  return page.getByRole("region", { name: "Cookie の利用について" });
}

/**
 * pagehide を出す。実際に離脱すると、Playwright は離脱中のページの keepalive リクエストを観測できない
 * （素の `fetch(..., { keepalive: true })` でも同じ）。そこで bfcache に入るときと同じイベントをページ上で出し、
 * ページを残したまま送信の有無を見る。
 */
async function pageHide(page: Page) {
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true })));
}

/** 送信されるならされるだけの時間を置く（「送らない」ことを確かめるため） */
async function settle(page: Page) {
  await page.waitForTimeout(500);
}

/** タブを裏に回したときと同じく、visibilityState を hidden にして visibilitychange を出す */
async function hide(page: Page) {
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

const engagements = (calls: ApiCall[]) => calls.filter((call) => call.path === "/api/posts/welcome/engagement");

test("AC6・AC1〜AC3: 同意済みなら GET の結果を表示し、トグル・排他で PUT して表示を更新する", async ({ page, context }) => {
  const id = idFor("B");
  await grantedVisitor(context, id);
  const calls = await mockApi(page);
  await page.goto("/posts/welcome/");
  const r = reaction(page);

  await expect(r.like).toBeEnabled();
  await expect(r.like).toHaveText("いいね 3");
  await expect(r.bad).toHaveText("バッド 1");
  await expect(r.like).toHaveAttribute("aria-pressed", "false");
  await expect(r.notice).toBeHidden();
  expect(calls[0]).toMatchObject({ method: "GET", path: "/api/posts/welcome/reaction", visitorId: id });
  expect(calls[0]?.query.get("variant")).toBe("B");

  // AC1: いいね
  await r.like.click();
  await expect(r.like).toHaveAttribute("aria-pressed", "true");
  await expect(r.like).toHaveText("いいね 4");
  expect(calls.at(-1)).toMatchObject({ method: "PUT", visitorId: id, body: { variant: "B", reaction: "like" } });

  // AC3: いいね済み → バッド
  await r.bad.click();
  await expect(r.bad).toHaveAttribute("aria-pressed", "true");
  await expect(r.like).toHaveAttribute("aria-pressed", "false");
  await expect(r.like).toHaveText("いいね 3");
  await expect(r.bad).toHaveText("バッド 2");
  expect(calls.at(-1)?.body).toEqual({ variant: "B", reaction: "bad" });

  // AC2: バッド済み → バッド
  await r.bad.click();
  await expect(r.bad).toHaveAttribute("aria-pressed", "false");
  await expect(r.bad).toHaveText("バッド 1");
  expect(calls.at(-1)?.body).toEqual({ variant: "B", reaction: "none" });
});

test("AC4: スクロールしてから hidden → pagehide と続いても engagement を 1 回だけ送る", async ({ page, context }) => {
  await grantedVisitor(context, idFor("A"));
  await page.setViewportSize({ width: 800, height: 200 });
  const calls = await mockApi(page);
  await page.goto("/posts/welcome/");
  await expect(reaction(page).like).toHaveText("いいね 3");

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(1100);
  await hide(page);
  await expect.poll(() => engagements(calls).length).toBe(1);

  // 続けて pagehide が起きても二重に送らない
  await pageHide(page);
  await settle(page);
  expect(engagements(calls)).toHaveLength(1);
  const [sent] = engagements(calls);
  expect(sent).toMatchObject({ method: "POST", visitorId: idFor("A"), body: { variant: "A", maxScrollDepth: 100 } });
  const body = sent?.body as { durationSeconds: number; maxScrollDepth: number };
  expect(Number.isInteger(body.maxScrollDepth)).toBe(true);
  expect(body.durationSeconds).toBeGreaterThanOrEqual(1);
  expect(body.durationSeconds).toBeLessThan(60);
});

test("AC4: hidden にならずに pagehide が起きても送る（スクロールしていなければ深さは 100 未満）", async ({ page, context }) => {
  await grantedVisitor(context, idFor("A"));
  await page.setViewportSize({ width: 800, height: 200 });
  const calls = await mockApi(page);
  await page.goto("/posts/welcome/");
  await expect(reaction(page).like).toHaveText("いいね 3");

  await pageHide(page);
  await expect.poll(() => engagements(calls).length).toBe(1);
  const body = engagements(calls)[0]?.body as { maxScrollDepth: number };
  expect(Number.isInteger(body.maxScrollDepth)).toBe(true);
  expect(body.maxScrollDepth).toBeGreaterThanOrEqual(0);
  expect(body.maxScrollDepth).toBeLessThan(100);
  await hide(page);
  await settle(page);
  expect(engagements(calls)).toHaveLength(1);
});

for (const consent of ["未同意", "拒否"] as const) {
  test(`AC5: ${consent}なら API を一切呼ばず、ボタンは無効で案内文を出す`, async ({ page, context }) => {
    if (consent === "拒否") await context.addInitScript(() => localStorage.setItem("abdoc:consent", "denied"));
    const calls = await mockApi(page);
    await page.goto("/posts/welcome/");
    const r = reaction(page);

    await expect(r.section).toBeVisible();
    await expect(r.like).toBeDisabled();
    await expect(r.bad).toBeDisabled();
    await expect(r.notice).toBeVisible();
    await expect(r.like).toHaveText("いいね -");

    await r.like.click({ force: true });
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await hide(page);
    await pageHide(page);
    await settle(page);
    expect(calls).toEqual([]);
  });
}

test("AC8: 未同意 → バナーで同意すると、再読み込みせずにボタンが有効になり GET を 1 回行い、その後の hidden で送る", async ({ page }) => {
  await page.addInitScript((value) => {
    crypto.randomUUID = () => value as `${string}-${string}-${string}-${string}-${string}`;
  }, VID);
  const calls = await mockApi(page, { likes: 7, bads: 2, myReaction: "none" });
  await page.goto("/posts/welcome/");
  const r = reaction(page);
  await expect(r.like).toBeDisabled();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));

  await banner(page).getByRole("button", { name: "同意する" }).click();

  await expect(r.like).toBeEnabled();
  await expect(r.notice).toBeHidden();
  await expect(r.like).toHaveText("いいね 7");
  expect(calls.map((call) => call.method)).toEqual(["GET"]);
  expect(calls[0]?.visitorId).toBe(VID);

  await hide(page);
  await expect.poll(() => engagements(calls).length).toBe(1);
  expect(engagements(calls)[0]?.visitorId).toBe(VID);
});

test("AC8: 同意 → フッターから拒否すると、再読み込みせずにボタンが無効になり、以後は PUT も engagement も送らない", async ({ page, context }) => {
  await grantedVisitor(context, idFor("A"));
  const calls = await mockApi(page);
  await page.goto("/posts/welcome/");
  const r = reaction(page);
  await expect(r.like).toHaveText("いいね 3");

  await page.getByRole("contentinfo").getByRole("button", { name: "Cookie の設定" }).click();
  await banner(page).getByRole("button", { name: "拒否する" }).click();

  await expect(r.like).toBeDisabled();
  await expect(r.bad).toBeDisabled();
  await expect(r.notice).toBeVisible();
  await r.like.click({ force: true });
  await hide(page);
  await pageHide(page);
  await settle(page);
  expect(calls.map((call) => call.method)).toEqual(["GET"]);
});

test("AC7: API が失敗しても記事は読め、表示は直前のまま", async ({ page, context }) => {
  await grantedVisitor(context, idFor("A"));
  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    (route) => route.fulfill({ status: 503, body: "Service Unavailable" }),
  );
  await page.goto("/posts/welcome/");
  const r = reaction(page);

  await expect(page.getByRole("heading", { level: 1, name: "ABDOC へようこそ" })).toBeVisible();
  await expect(r.like).toBeEnabled();
  await Promise.all([page.waitForResponse((res) => res.request().method() === "PUT"), r.like.click()]);
  await settle(page);
  await expect(r.like).toHaveAttribute("aria-pressed", "false");
  await expect(r.like).toHaveText("いいね -");
});
