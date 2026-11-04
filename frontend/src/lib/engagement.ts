/**
 * 記事ページの engagement（最大スクロール深さ・可視状態だった秒数）の計測と送信（クライアント側）。
 * - 計測は同意の有無にかかわらずページ読み込み時から、ブラウザの中だけで行う。
 * - 送信は `visibilitychange`（hidden）か `pagehide` のとき、その時点で同意済みの場合だけ、1 ページ表示につき 1 回。
 *   途中で同意した場合も読み込み時からの値を送る。未同意で送らなかった場合は、後で同意してから離脱したときに送る。
 * - `sendBeacon` はヘッダーを付けられないので使わず、`client.ts` 経由の `fetch(..., { keepalive: true })` で送る。
 * ブラウザ API には直接依存せず、時刻・可視状態・スクロール位置を注入できるようにしてある（単体テストのため）。
 */
import type { ApiClient, components } from "../api/client";

export type EngagementRequest = components["schemas"]["EngagementRequest"];
type Variant = components["schemas"]["Variant"];

export interface ScrollMetrics {
  /** `window.scrollY` */
  scrollTop: number;
  /** `window.innerHeight` */
  viewportHeight: number;
  /** `document.documentElement.scrollHeight` */
  documentHeight: number;
}

/** `(scrollTop + viewport 高さ) / 文書全体の高さ` を整数 % に丸め、0〜100 に収める。文書が画面より短ければ 100 */
export function scrollDepth({ scrollTop, viewportHeight, documentHeight }: ScrollMetrics): number {
  if (!(documentHeight > 0) || documentHeight <= viewportHeight) return 100;
  const percent = Math.round(((scrollTop + viewportHeight) / documentHeight) * 100);
  return Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : 0;
}

/** `POST /api/posts/{slug}/engagement` を `keepalive` で送る。失敗しても例外は投げない */
export async function postEngagement(
  client: ApiClient,
  { slug, visitorId, body }: { slug: string; visitorId: string; body: EngagementRequest },
): Promise<void> {
  try {
    await client.POST("/api/posts/{slug}/engagement", {
      params: { path: { slug }, header: { "X-Abdoc-Visitor-Id": visitorId } },
      body,
      keepalive: true,
    });
  } catch {
    // 離脱時の送信なので、失敗しても何もしない（リトライ・キューはスコープ外）
  }
}

export interface EngagementTrackerOptions {
  slug: string;
  variant: Variant;
  /** ミリ秒の単調増加する時刻（`performance.now()`） */
  now: () => number;
  /** 作った時点でページが可視か（`document.visibilityState === "visible"`） */
  visible: boolean;
  /** 作った時点のスクロール位置 */
  metrics: ScrollMetrics;
  /** 同意済みならその訪問者 ID、そうでなければ `null`（送る直前に呼ぶ） */
  getVisitorId: () => string | null;
  send: (request: { slug: string; visitorId: string; body: EngagementRequest }) => void;
}

export interface EngagementTracker {
  /** スクロール・リサイズのたびに呼ぶ */
  scrolled(metrics: ScrollMetrics): void;
  /** `visibilitychange` のたびに呼ぶ。hidden なら送信を試みる */
  visibilityChanged(visible: boolean): void;
  /** `pagehide` で呼ぶ。送信を試みる */
  pageHidden(): void;
  /** 今までの値（送信前の確認用） */
  snapshot(): Pick<EngagementRequest, "maxScrollDepth" | "durationSeconds">;
}

export function createEngagementTracker(options: EngagementTrackerOptions): EngagementTracker {
  const { slug, variant, now, getVisitorId, send } = options;
  let maxScrollDepth = scrollDepth(options.metrics);
  let visibleMs = 0;
  let visibleSince: number | null = options.visible ? now() : null;
  let sent = false;

  function pause() {
    if (visibleSince === null) return;
    visibleMs += Math.max(0, now() - visibleSince);
    visibleSince = null;
  }

  function snapshot() {
    const running = visibleSince === null ? 0 : Math.max(0, now() - visibleSince);
    return { maxScrollDepth, durationSeconds: (visibleMs + running) / 1000 };
  }

  function flush() {
    if (sent) return;
    const visitorId = getVisitorId();
    // 未同意・拒否なら送らない（計測した値はページの外に出さない）
    if (visitorId === null) return;
    sent = true;
    send({ slug, visitorId, body: { variant, ...snapshot() } });
  }

  return {
    scrolled(metrics) {
      maxScrollDepth = Math.max(maxScrollDepth, scrollDepth(metrics));
    },
    visibilityChanged(visible) {
      if (visible) {
        visibleSince ??= now();
      } else {
        pause();
        flush();
      }
    },
    pageHidden() {
      pause();
      flush();
    },
    snapshot,
  };
}

/** ブラウザのイベントにつなぐ。戻り値はイベントの解除 */
export function trackEngagement(opts: {
  client: ApiClient;
  slug: string;
  variant: Variant;
  getVisitorId: () => string | null;
}): () => void {
  const metrics = (): ScrollMetrics => ({
    scrollTop: window.scrollY,
    viewportHeight: window.innerHeight,
    documentHeight: document.documentElement.scrollHeight,
  });
  const tracker = createEngagementTracker({
    ...opts,
    now: () => performance.now(),
    visible: document.visibilityState === "visible",
    metrics: metrics(),
    send: (request) => void postEngagement(opts.client, request),
  });
  const onScroll = () => tracker.scrolled(metrics());
  const onVisibility = () => tracker.visibilityChanged(document.visibilityState === "visible");
  const onPageHide = () => tracker.pageHidden();
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", onPageHide);
  return () => {
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", onScroll);
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pagehide", onPageHide);
  };
}
