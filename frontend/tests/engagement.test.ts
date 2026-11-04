import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createApiClient } from "../src/api/client";
import {
  createEngagementTracker,
  type EngagementRequest,
  postEngagement,
  type ScrollMetrics,
  scrollDepth,
} from "../src/lib/engagement";

const VID = "11111111-1111-4111-8111-111111111111";

/** 文書 2000px・画面 500px で `scrollTop` だけ変える */
const at = (scrollTop: number): ScrollMetrics => ({ scrollTop, viewportHeight: 500, documentHeight: 2000 });

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

function setup(opts: { visitorId?: string | null; visible?: boolean; metrics?: ScrollMetrics } = {}) {
  let visitorId = opts.visitorId === undefined ? VID : opts.visitorId;
  const sent: { slug: string; visitorId: string; body: EngagementRequest }[] = [];
  const tracker = createEngagementTracker({
    slug: "welcome",
    variant: "A",
    now: () => Date.now(),
    visible: opts.visible ?? true,
    metrics: opts.metrics ?? at(0),
    getVisitorId: () => visitorId,
    send: (request) => sent.push(request),
  });
  return {
    tracker,
    sent,
    setVisitorId: (id: string | null) => {
      visitorId = id;
    },
  };
}

describe("scrollDepth", () => {
  test("(scrollTop + viewport) / 文書の高さ を整数 % に丸める", () => {
    expect(scrollDepth(at(0))).toBe(25);
    expect(scrollDepth(at(500))).toBe(50);
    expect(scrollDepth(at(1500))).toBe(100);
    expect(scrollDepth({ scrollTop: 100, viewportHeight: 500, documentHeight: 3000 })).toBe(20);
    expect(scrollDepth({ scrollTop: 1, viewportHeight: 500, documentHeight: 3000 })).toBe(17); // 16.7 → 17
  });

  test("0〜100 に収める（オーバースクロールや負の値）", () => {
    expect(scrollDepth(at(5000))).toBe(100);
    expect(scrollDepth({ scrollTop: -2000, viewportHeight: 500, documentHeight: 2000 })).toBe(0);
  });

  test("文書が画面より短い（同じ）なら 100", () => {
    expect(scrollDepth({ scrollTop: 0, viewportHeight: 800, documentHeight: 600 })).toBe(100);
    expect(scrollDepth({ scrollTop: 0, viewportHeight: 800, documentHeight: 800 })).toBe(100);
    expect(scrollDepth({ scrollTop: 0, viewportHeight: 800, documentHeight: 0 })).toBe(100);
  });
});

describe("AC4: 計測と 1 回だけの送信", () => {
  test("スクロールしてから hidden: 最大スクロール深さ（整数 %）と可視秒数を 1 回送る", () => {
    const { tracker, sent } = setup();
    vi.advanceTimersByTime(2000);
    tracker.scrolled(at(1000)); // 75%
    vi.advanceTimersByTime(1500);
    tracker.scrolled(at(300)); // 戻っても最大値は保つ
    vi.advanceTimersByTime(500);

    tracker.visibilityChanged(false);

    expect(sent).toEqual([
      { slug: "welcome", visitorId: VID, body: { variant: "A", maxScrollDepth: 75, durationSeconds: 4 } },
    ]);
    expect(Number.isInteger(sent[0]?.body.maxScrollDepth)).toBe(true);
  });

  test("pagehide でも送る", () => {
    const { tracker, sent } = setup();
    vi.advanceTimersByTime(1234);
    tracker.pageHidden();
    expect(sent).toEqual([
      { slug: "welcome", visitorId: VID, body: { variant: "A", maxScrollDepth: 25, durationSeconds: 1.234 } },
    ]);
  });

  test("hidden → pagehide と続いても二重送信しない。可視に戻って再び hidden になっても送らない", () => {
    const { tracker, sent } = setup();
    vi.advanceTimersByTime(1000);
    tracker.visibilityChanged(false);
    tracker.pageHidden();
    tracker.visibilityChanged(true);
    vi.advanceTimersByTime(1000);
    tracker.visibilityChanged(false);
    tracker.pageHidden();
    expect(sent).toHaveLength(1);
  });

  test("バックグラウンドの時間は滞在秒数に含めない", () => {
    const { tracker } = setup();
    vi.advanceTimersByTime(3000);
    tracker.visibilityChanged(false); // ここで送信される。以後の値は snapshot で見る
    vi.advanceTimersByTime(60_000);
    expect(tracker.snapshot().durationSeconds).toBe(3);
    tracker.visibilityChanged(true);
    vi.advanceTimersByTime(2000);
    expect(tracker.snapshot().durationSeconds).toBe(5);
  });

  test("可視→hidden→可視→pagehide で、未送信なら可視の合計だけを送る（拒否中に hidden、同意後に pagehide）", () => {
    const { tracker, sent, setVisitorId } = setup({ visitorId: null });
    vi.advanceTimersByTime(1000);
    tracker.visibilityChanged(false);
    vi.advanceTimersByTime(30_000);
    tracker.visibilityChanged(true);
    vi.advanceTimersByTime(2000);
    setVisitorId(VID);
    tracker.pageHidden();
    expect(sent.map((s) => s.body.durationSeconds)).toEqual([3]);
  });

  test("読み込み時にバックグラウンドなら、可視になるまで数えない", () => {
    const { tracker, sent } = setup({ visible: false });
    vi.advanceTimersByTime(10_000);
    tracker.visibilityChanged(true);
    vi.advanceTimersByTime(1000);
    tracker.pageHidden();
    expect(sent[0]?.body.durationSeconds).toBe(1);
  });

  test("滞在 0 秒・スクロール 0% でも条件を付けずに送る", () => {
    const { tracker, sent } = setup({ metrics: { scrollTop: 0, viewportHeight: 0, documentHeight: 2000 } });
    tracker.pageHidden();
    expect(sent).toEqual([
      { slug: "welcome", visitorId: VID, body: { variant: "A", maxScrollDepth: 0, durationSeconds: 0 } },
    ]);
  });

  test("文書が画面より短ければ、スクロールしなくても 100%", () => {
    const { tracker, sent } = setup({ metrics: { scrollTop: 0, viewportHeight: 900, documentHeight: 600 } });
    tracker.pageHidden();
    expect(sent[0]?.body.maxScrollDepth).toBe(100);
  });
});

describe("AC5 / AC8: 同意と送信", () => {
  test("AC5: 未同意・拒否のままなら送らない", () => {
    const { tracker, sent } = setup({ visitorId: null });
    tracker.scrolled(at(1500));
    tracker.visibilityChanged(false);
    tracker.pageHidden();
    expect(sent).toEqual([]);
  });

  test("AC8: 途中で同意したら、その後の hidden で読み込み時からの値を送る", () => {
    const { tracker, sent, setVisitorId } = setup({ visitorId: null });
    vi.advanceTimersByTime(4000);
    tracker.scrolled(at(1500)); // 同意前のスクロール
    vi.advanceTimersByTime(1000);
    setVisitorId(VID); // 同意（visitor の onConsentChange 相当: 以後 getVisitorId が値を返す）
    vi.advanceTimersByTime(1000);

    tracker.visibilityChanged(false);

    expect(sent).toEqual([
      { slug: "welcome", visitorId: VID, body: { variant: "A", maxScrollDepth: 100, durationSeconds: 6 } },
    ]);
  });

  test("AC8: 同意 → 拒否にしたら、以後は送らない", () => {
    const { tracker, sent, setVisitorId } = setup();
    vi.advanceTimersByTime(1000);
    setVisitorId(null);
    tracker.visibilityChanged(false);
    tracker.pageHidden();
    expect(sent).toEqual([]);
  });
});

describe("postEngagement", () => {
  test("AC4: client.ts 経由で POST し、keepalive・X-Abdoc-Visitor-Id・本文を付ける", async () => {
    vi.useRealTimers();
    const fetch = vi.fn<(request: Request) => Promise<Response>>(async () => new Response(null, { status: 204 }));
    const client = createApiClient({ baseUrl: "http://api.test", fetch });

    await postEngagement(client, {
      slug: "welcome",
      visitorId: VID,
      body: { variant: "B", maxScrollDepth: 42, durationSeconds: 1.5 },
    });

    expect(fetch).toHaveBeenCalledOnce();
    const request = fetch.mock.calls[0]?.[0];
    expect(request?.method).toBe("POST");
    expect(request?.url).toBe("http://api.test/api/posts/welcome/engagement");
    expect(request?.keepalive).toBe(true);
    expect(request?.headers.get("X-Abdoc-Visitor-Id")).toBe(VID);
    expect(await request?.json()).toEqual({ variant: "B", maxScrollDepth: 42, durationSeconds: 1.5 });
  });

  test("ネットワークエラーや 5xx でも例外を投げない", async () => {
    vi.useRealTimers();
    for (const fetch of [
      async () => {
        throw new TypeError("Failed to fetch");
      },
      async () => new Response("oops", { status: 500 }),
    ]) {
      const client = createApiClient({ baseUrl: "http://api.test", fetch });
      await expect(
        postEngagement(client, { slug: "welcome", visitorId: VID, body: { variant: "A", maxScrollDepth: 0, durationSeconds: 0 } }),
      ).resolves.toBeUndefined();
    }
  });
});
