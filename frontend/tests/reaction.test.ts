import { describe, expect, test, vi } from "vitest";
import { createApiClient } from "../src/api/client";
import {
  createReactionController,
  createReactionView,
  nextReaction,
  type ReactionElements,
  type ReactionState,
  type ReactionViewState,
} from "../src/lib/reaction";

const VID = "11111111-1111-4111-8111-111111111111";

interface Call {
  method: string;
  url: URL;
  visitorId: string | null;
  body: unknown;
}

/** API をモックする。`reply` が返したものをレスポンスにする（`Error` なら fetch が失敗） */
function api(reply: (call: Call) => Response | Error) {
  const calls: Call[] = [];
  const fetch = vi.fn(async (request: Request) => {
    const text = await request.text();
    const call = {
      method: request.method,
      url: new URL(request.url),
      visitorId: request.headers.get("X-Abdoc-Visitor-Id"),
      body: text ? (JSON.parse(text) as unknown) : undefined,
    };
    calls.push(call);
    const response = reply(call);
    if (response instanceof Error) throw response;
    return response;
  });
  return { calls, client: createApiClient({ baseUrl: "http://api.test", fetch }) };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** BE と同じ規則で状態を持つモック */
function backend(initial: ReactionState = { likes: 3, bads: 1, myReaction: "none" }) {
  const state = { ...initial };
  return (call: Call) => {
    if (call.method === "PUT") {
      const { reaction } = call.body as { reaction: ReactionState["myReaction"] };
      if (state.myReaction === "like") state.likes--;
      if (state.myReaction === "bad") state.bads--;
      if (reaction === "like") state.likes++;
      if (reaction === "bad") state.bads++;
      state.myReaction = reaction;
    }
    return json(state);
  };
}

function setup(opts: { reply: (call: Call) => Response | Error; visitorId?: string | null }) {
  const { calls, client } = api(opts.reply);
  let visitorId = opts.visitorId === undefined ? VID : opts.visitorId;
  const renders: ReactionViewState[] = [];
  const controller = createReactionController({
    client,
    slug: "welcome",
    variant: "B",
    getVisitorId: () => visitorId,
    view: { render: (view) => renders.push(structuredClone(view)) },
  });
  return {
    calls,
    controller,
    last: () => renders.at(-1),
    setVisitorId: (id: string | null) => {
      visitorId = id;
    },
  };
}

/** 初期表示（同意済みなら GET）が終わるのを待つ */
function loaded(s: ReturnType<typeof setup>) {
  return s.controller.ready;
}

describe("nextReaction", () => {
  test("同じボタン → none、別のボタン → 後から押した方", () => {
    expect(nextReaction("none", "like")).toBe("like");
    expect(nextReaction("like", "like")).toBe("none");
    expect(nextReaction("bad", "bad")).toBe("none");
    expect(nextReaction("bad", "like")).toBe("like");
    expect(nextReaction("like", "bad")).toBe("bad");
  });
});

describe("AC6: 初期表示", () => {
  test("同意済みなら GET ?variant=… を X-Abdoc-Visitor-Id 付きで呼び、件数と押下状態を表示する", async () => {
    const s = setup({ reply: backend({ likes: 5, bads: 2, myReaction: "bad" }) });
    await loaded(s);

    expect(s.calls).toHaveLength(1);
    expect(s.calls[0]?.method).toBe("GET");
    expect(s.calls[0]?.url.pathname).toBe("/api/posts/welcome/reaction");
    expect(s.calls[0]?.url.searchParams.get("variant")).toBe("B");
    expect(s.calls[0]?.visitorId).toBe(VID);
    expect(s.last()).toEqual({ enabled: true, state: { likes: 5, bads: 2, myReaction: "bad" } });
  });
});

describe("AC1〜AC3: トグル・排他", () => {
  test("AC1: まだ押していない → いいね: PUT like を送り、レスポンスで表示を更新する", async () => {
    const s = setup({ reply: backend() });
    await loaded(s);

    await s.controller.press("like");

    const put = s.calls.at(-1);
    expect(put?.method).toBe("PUT");
    expect(put?.url.pathname).toBe("/api/posts/welcome/reaction");
    expect(put?.visitorId).toBe(VID);
    expect(put?.body).toEqual({ variant: "B", reaction: "like" });
    expect(s.last()).toEqual({ enabled: true, state: { likes: 4, bads: 1, myReaction: "like" } });
  });

  test("AC1: 表示はレスポンスの値に従う（手元で数えない）", async () => {
    const s = setup({
      reply: (call) => json(call.method === "PUT" ? { likes: 100, bads: 7, myReaction: "like" } : { likes: 0, bads: 0, myReaction: "none" }),
    });
    await loaded(s);
    await s.controller.press("like");
    expect(s.last()?.state).toEqual({ likes: 100, bads: 7, myReaction: "like" });
  });

  test.each(["like", "bad"] as const)("AC2: %s 済みでもう一度押す → none を送り、押す前の表示に戻る", async (button) => {
    const s = setup({ reply: backend() });
    await loaded(s);
    const before = s.last();

    await s.controller.press(button);
    await s.controller.press(button);

    expect(s.calls.at(-1)?.body).toEqual({ variant: "B", reaction: "none" });
    expect(s.last()).toEqual(before);
  });

  test("AC3: バッド済み → いいね: like を送り、バッドが外れていいねが付く", async () => {
    const s = setup({ reply: backend({ likes: 3, bads: 1, myReaction: "bad" }) });
    await loaded(s);

    await s.controller.press("like");

    expect(s.calls.at(-1)?.body).toEqual({ variant: "B", reaction: "like" });
    expect(s.last()?.state).toEqual({ likes: 4, bads: 0, myReaction: "like" });
  });

  test("AC3: いいね済み → バッド: bad を送り、いいねが外れてバッドが付く", async () => {
    const s = setup({ reply: backend({ likes: 3, bads: 1, myReaction: "like" }) });
    await loaded(s);

    await s.controller.press("bad");

    expect(s.calls.at(-1)?.body).toEqual({ variant: "B", reaction: "bad" });
    expect(s.last()?.state).toEqual({ likes: 2, bads: 2, myReaction: "bad" });
  });

  test("応答待ちの間の連打は送らない（順序の入れ替わりを防ぐ）", async () => {
    const s = setup({ reply: backend() });
    await loaded(s);
    await Promise.all([s.controller.press("like"), s.controller.press("like")]);
    expect(s.calls.filter((call) => call.method === "PUT")).toHaveLength(1);
    expect(s.last()?.state?.myReaction).toBe("like");
  });
});

describe("AC5: 未同意・拒否", () => {
  test("getVisitorId が null（未同意・拒否）なら GET も PUT も呼ばず、ボタンは無効", async () => {
    const s = setup({ reply: backend(), visitorId: null });
    await loaded(s);
    await s.controller.press("like");
    await s.controller.press("bad");

    expect(s.calls).toEqual([]);
    expect(s.last()).toEqual({ enabled: false, state: null });
  });
});

describe("AC7: API の失敗", () => {
  const failures: [string, () => Response | Error][] = [
    ["ネットワーク", () => new TypeError("Failed to fetch")],
    ["400", () => json({ message: "bad" }, 400)],
    ["500", () => json({ message: "oops" }, 500)],
    ["503（JSON でない）", () => new Response("Service Unavailable", { status: 503 })],
  ];

  test.each(failures)("初期 GET が %s で失敗しても、表示は直前のまま（件数は未取得）で押せる", async (_, fail) => {
    const s = setup({ reply: fail });
    await loaded(s);
    expect(s.last()).toEqual({ enabled: true, state: null });
  });

  test.each(failures)("PUT が %s で失敗したら、表示は押す前のまま", async (_, fail) => {
    let failing = false;
    const ok = backend({ likes: 3, bads: 1, myReaction: "bad" });
    const s = setup({ reply: (call) => (failing ? fail() : ok(call)) });
    await loaded(s);
    const before = s.last();

    failing = true;
    await expect(s.controller.press("like")).resolves.toBeUndefined();

    expect(s.calls.at(-1)?.method).toBe("PUT");
    expect(s.last()).toEqual(before);

    // 失敗の後も操作を続けられる
    failing = false;
    await s.controller.press("like");
    expect(s.last()?.state?.myReaction).toBe("like");
  });
});

describe("AC8: 同意の動的反映", () => {
  test("未同意 → 同意: ボタンが有効になり、その時点で GET を 1 回行う。以後は押せる", async () => {
    const s = setup({ reply: backend({ likes: 2, bads: 0, myReaction: "like" }), visitorId: null });
    await loaded(s);
    expect(s.calls).toEqual([]);
    expect(s.last()?.enabled).toBe(false);

    s.setVisitorId(VID);
    await s.controller.consentChanged();
    // 同じ状態のまま通知が重なっても GET は増やさない
    await s.controller.consentChanged();

    expect(s.calls.map((call) => call.method)).toEqual(["GET"]);
    expect(s.calls[0]?.visitorId).toBe(VID);
    expect(s.last()).toEqual({ enabled: true, state: { likes: 2, bads: 0, myReaction: "like" } });

    await s.controller.press("like");
    expect(s.calls.at(-1)?.body).toEqual({ variant: "B", reaction: "none" });
  });

  test("同意 → 拒否: ボタンが無効になり、以後は PUT を送らない", async () => {
    const s = setup({ reply: backend() });
    await loaded(s);

    s.setVisitorId(null);
    await s.controller.consentChanged();
    await s.controller.press("like");

    expect(s.calls.map((call) => call.method)).toEqual(["GET"]);
    expect(s.last()?.enabled).toBe(false);
  });

  test("拒否 → もう一度同意: 改めて GET する", async () => {
    const s = setup({ reply: backend() });
    await loaded(s);
    s.setVisitorId(null);
    await s.controller.consentChanged();
    s.setVisitorId(VID);
    await s.controller.consentChanged();
    expect(s.calls.map((call) => call.method)).toEqual(["GET", "GET"]);
    expect(s.last()?.enabled).toBe(true);
  });
});

describe("createReactionView", () => {
  function elements() {
    const attrs = { like: new Map<string, string>(), bad: new Map<string, string>() };
    const button = (name: "like" | "bad") => ({
      disabled: false,
      setAttribute: (key: string, value: string) => attrs[name].set(key, value),
    });
    const els = {
      buttons: { like: button("like"), bad: button("bad") },
      counts: { like: { textContent: "" }, bad: { textContent: "" } },
      notice: { hidden: false },
    } satisfies ReactionElements;
    return { els, attrs, view: createReactionView(els) };
  }

  test("AC6: 件数と aria-pressed を表示し、同意済みなら案内文を隠す", () => {
    const { els, attrs, view } = elements();
    view.render({ enabled: true, state: { likes: 4, bads: 0, myReaction: "like" } });
    expect(els.counts.like.textContent).toBe("4");
    expect(els.counts.bad.textContent).toBe("0");
    expect(attrs.like.get("aria-pressed")).toBe("true");
    expect(attrs.bad.get("aria-pressed")).toBe("false");
    expect(els.buttons.like.disabled).toBe(false);
    expect(els.buttons.bad.disabled).toBe(false);
    expect(els.notice.hidden).toBe(true);
  });

  test("AC5: 未同意ならボタンを無効にして案内文を出す。未取得の件数は「-」", () => {
    const { els, attrs, view } = elements();
    view.render({ enabled: false, state: null });
    expect(els.buttons.like.disabled).toBe(true);
    expect(els.buttons.bad.disabled).toBe(true);
    expect(attrs.like.get("aria-pressed")).toBe("false");
    expect(els.counts.like.textContent).toBe("-");
    expect(els.notice.hidden).toBe(false);
  });
});
