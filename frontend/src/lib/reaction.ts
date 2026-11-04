/**
 * 記事のいいね/バッド（クライアント側）。
 * - トグルで、いいねとバッドは排他（同じボタン → `none`、別のボタン → 後から押した方）。
 * - API は `client.ts`（openapi-fetch）経由で、ヘッダー `X-Abdoc-Visitor-Id` を付けて呼ぶ。
 * - 送信できるのは同意済み（`getVisitorId()` が値を返す）のときだけ。未同意・拒否ならボタンを無効にして API を呼ばない。
 * - API が失敗したら（ネットワーク・4xx・5xx）表示は直前のまま。
 * DOM には直接依存せず、表示（`ReactionView`）と ID の取得を注入できるようにしてある（単体テストのため）。
 */
import type { ApiClient, components } from "../api/client";

export type Reaction = components["schemas"]["Reaction"];
export type ReactionState = components["schemas"]["ReactionState"];
export type Variant = components["schemas"]["Variant"];
/** ボタンで押せるもの（`none` はトグルの結果としてだけ送る） */
export type ReactionButton = Exclude<Reaction, "none">;

/** 今の状態でボタン `pressed` を押したときに送るリアクション */
export function nextReaction(current: Reaction, pressed: ReactionButton): Reaction {
  return current === pressed ? "none" : pressed;
}

interface Target {
  slug: string;
  variant: Variant;
  visitorId: string;
}

/** `GET /api/posts/{slug}/reaction`。失敗したら `null` */
export async function fetchReaction(client: ApiClient, { slug, variant, visitorId }: Target): Promise<ReactionState | null> {
  try {
    const { data } = await client.GET("/api/posts/{slug}/reaction", {
      params: { path: { slug }, query: { variant }, header: { "X-Abdoc-Visitor-Id": visitorId } },
    });
    return data ?? null;
  } catch {
    return null;
  }
}

/** `PUT /api/posts/{slug}/reaction`。失敗したら `null` */
export async function putReaction(
  client: ApiClient,
  { slug, variant, visitorId }: Target,
  reaction: Reaction,
): Promise<ReactionState | null> {
  try {
    const { data } = await client.PUT("/api/posts/{slug}/reaction", {
      params: { path: { slug }, header: { "X-Abdoc-Visitor-Id": visitorId } },
      body: { variant, reaction },
    });
    return data ?? null;
  } catch {
    return null;
  }
}

export interface ReactionViewState {
  /** まだ取得できていなければ `null` */
  state: ReactionState | null;
  /** 同意済みで押せるか */
  enabled: boolean;
}

export interface ReactionView {
  render(view: ReactionViewState): void;
}

export interface ReactionControllerOptions {
  client: ApiClient;
  slug: string;
  variant: Variant;
  /** 同意済みならその訪問者 ID、そうでなければ `null`（`visitor().getVisitorId()`） */
  getVisitorId: () => string | null;
  view: ReactionView;
}

export interface ReactionController {
  /** 作った時点の初期表示（同意済みなら GET）が終わると解決する */
  ready: Promise<void>;
  /** ボタンが押された */
  press(button: ReactionButton): Promise<void>;
  /** 同意の選択が変わった（`visitor().onConsentChange` から呼ぶ） */
  consentChanged(): Promise<void>;
}

/**
 * ボタンの状態を管理する。作った時点で同意済みなら初期状態を GET する。
 * 未同意 → 同意に変わったらその時点で 1 回 GET し、同意 → 拒否ならボタンを無効にする。
 */
export function createReactionController(options: ReactionControllerOptions): ReactionController {
  const { client, slug, variant, getVisitorId, view } = options;
  let state: ReactionState | null = null;
  let enabled = false;
  /** PUT の応答待ち（連打で順序が入れ替わらないよう、その間の押下は無視する） */
  let pending = false;

  function render() {
    view.render({ state, enabled });
  }

  async function load(visitorId: string) {
    const loaded = await fetchReaction(client, { slug, variant, visitorId });
    // 取得中に拒否されたら、表示は更新しても押せないまま（render が enabled を見る）
    if (loaded) state = loaded;
    render();
  }

  async function sync() {
    const visitorId = getVisitorId();
    const wasEnabled = enabled;
    enabled = visitorId !== null;
    render();
    if (visitorId !== null && !wasEnabled) await load(visitorId);
  }

  const initial = sync();

  return {
    ready: initial,
    async press(button) {
      await initial;
      const visitorId = getVisitorId();
      if (!enabled || visitorId === null || pending) return;
      pending = true;
      try {
        const updated = await putReaction(client, { slug, variant, visitorId }, nextReaction(state?.myReaction ?? "none", button));
        if (updated) state = updated;
      } finally {
        pending = false;
      }
      render();
    },
    consentChanged: sync,
  };
}

/** `ReactionView` の DOM 実装が触るプロパティだけ（テストでは素のオブジェクトを渡せる） */
export interface ReactionElements {
  buttons: Record<ReactionButton, Pick<HTMLButtonElement, "disabled" | "setAttribute">>;
  counts: Record<ReactionButton, Pick<HTMLElement, "textContent">>;
  /** 「Cookie に同意すると評価できます」 */
  notice: Pick<HTMLElement, "hidden">;
}

/** ボタンの `disabled` / `aria-pressed`、件数、案内文を更新する */
export function createReactionView(elements: ReactionElements): ReactionView {
  return {
    render({ state, enabled }) {
      for (const button of ["like", "bad"] as const) {
        elements.buttons[button].disabled = !enabled;
        elements.buttons[button].setAttribute("aria-pressed", String(state?.myReaction === button));
      }
      elements.counts.like.textContent = state ? String(state.likes) : "-";
      elements.counts.bad.textContent = state ? String(state.bads) : "-";
      elements.notice.hidden = enabled;
    },
  };
}
