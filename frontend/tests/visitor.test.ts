import { describe, expect, test, vi } from "vitest";
import {
  CONSENT_KEY,
  createVisitor,
  readVisitorCookie,
  type StorageLike,
  VISITOR_COOKIE_ATTRIBUTES,
  type VisitorEnv,
} from "../src/lib/visitor";

const ID1 = "11111111-1111-4111-8111-111111111111";
const ID2 = "22222222-2222-4222-8222-222222222222";
const ID3 = "33333333-3333-4333-8333-333333333333";

/** テスト用の `localStorage` 相当（Map ベース） */
function memoryStorage(initial: Record<string, string> = {}): StorageLike & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

/** `document.cookie` 相当。書き込みは全部 `writes` に残し、`Max-Age=0` なら消す */
function cookieJar(initial: Record<string, string> = {}) {
  const jar = new Map(Object.entries(initial));
  const writes: string[] = [];
  return {
    jar,
    writes,
    read: () => [...jar].map(([k, v]) => `${k}=${v}`).join("; "),
    write: (cookie: string) => {
      writes.push(cookie);
      const [pair = ""] = cookie.split(";");
      const [name = "", value = ""] = pair.split("=");
      if (/Max-Age=0(;|$)/.test(cookie)) jar.delete(name);
      else jar.set(name, value);
    },
  };
}

function setup(opts: { storage?: Record<string, string>; cookies?: Record<string, string>; ids?: string[] } = {}) {
  const storage = memoryStorage(opts.storage);
  const cookies = cookieJar(opts.cookies);
  const ids = [...(opts.ids ?? [ID1, ID2, ID3])];
  const env: VisitorEnv = {
    storage: () => storage,
    cookies,
    randomUUID: () => {
      const id = ids.shift();
      if (!id) throw new Error("ID が足りない");
      return id;
    },
  };
  return { storage, cookies, env, visitor: createVisitor(env) };
}

describe("readVisitorCookie", () => {
  test("abdoc_vid を取り出す（他の Cookie は無視）", () => {
    expect(readVisitorCookie(`a=1; abdoc_vid=${ID1}; __session=x`)).toBe(ID1);
  });
  test("無い・空・UUID でない値は null", () => {
    expect(readVisitorCookie("")).toBeNull();
    expect(readVisitorCookie("abdoc_vid=")).toBeNull();
    expect(readVisitorCookie("abdoc_vid=not-a-uuid")).toBeNull();
    expect(readVisitorCookie(`xabdoc_vid=${ID1}`)).toBeNull();
  });
});

describe("未同意・拒否（AC2・AC5）", () => {
  test("未同意: 一時 ID で割り当て、Cookie は書かない。getVisitorId は null", () => {
    const { visitor, cookies } = setup();
    expect(visitor.getConsent()).toBeNull();
    expect(visitor.getAssignmentId()).toBe(ID1);
    expect(visitor.getAssignmentId()).toBe(ID1); // ページ内では同じ一時 ID
    expect(visitor.getVisitorId()).toBeNull();
    expect(cookies.writes).toEqual([]);
  });

  test("拒否済み: 一時 ID で割り当て、Cookie は書かない。getVisitorId は null", () => {
    const { visitor, cookies } = setup({ storage: { [CONSENT_KEY]: "denied" } });
    expect(visitor.getConsent()).toBe("denied");
    expect(visitor.getAssignmentId()).toBe(ID1);
    expect(visitor.getVisitorId()).toBeNull();
    expect(cookies.writes).toEqual([]);
  });

  test("拒否済みなら、残っている abdoc_vid も使わない", () => {
    const { visitor } = setup({ storage: { [CONSENT_KEY]: "denied" }, cookies: { abdoc_vid: ID3 } });
    expect(visitor.getAssignmentId()).toBe(ID1);
    expect(visitor.getVisitorId()).toBeNull();
  });

  test("一時 ID はページ（Visitor）ごとに作り直す", () => {
    const { env } = setup();
    expect(createVisitor(env).getAssignmentId()).toBe(ID1);
    expect(createVisitor(env).getAssignmentId()).toBe(ID2);
  });

  test("保存値が不正なら未同意とみなす", () => {
    const { visitor } = setup({ storage: { [CONSENT_KEY]: "yes" } });
    expect(visitor.getConsent()).toBeNull();
    expect(visitor.getVisitorId()).toBeNull();
  });
});

describe("同意する（AC2・AC5）", () => {
  test("同意した時点で一時 ID を属性付きで abdoc_vid に保存し、割り当て ID は変わらない", () => {
    const { visitor, cookies, storage } = setup();
    const before = visitor.getAssignmentId();

    visitor.setConsent("granted");

    expect(storage.data.get(CONSENT_KEY)).toBe("granted");
    expect(cookies.writes).toEqual([`abdoc_vid=${before}; Path=/; Secure; SameSite=Lax; Max-Age=31536000`]);
    expect(VISITOR_COOKIE_ATTRIBUTES).toBe("Path=/; Secure; SameSite=Lax; Max-Age=31536000");
    expect(visitor.getAssignmentId()).toBe(before);
    expect(visitor.getVisitorId()).toBe(before);
  });

  test("割り当て前に同意しても、その ID がそのまま割り当てに使われる", () => {
    const { visitor, cookies } = setup();
    visitor.setConsent("granted");
    expect(cookies.jar.get("abdoc_vid")).toBe(ID1);
    expect(visitor.getAssignmentId()).toBe(ID1);
  });

  test("再訪（同意済み + Cookie あり）: Cookie の ID を使い、新しく作らない・書き直さない", () => {
    const { visitor, cookies } = setup({ storage: { [CONSENT_KEY]: "granted" }, cookies: { abdoc_vid: ID3 } });
    expect(visitor.getAssignmentId()).toBe(ID3);
    expect(visitor.getVisitorId()).toBe(ID3);
    expect(cookies.writes).toEqual([]);
  });
});

describe("期限切れ（AC6）", () => {
  test("同意済みで Cookie が無いなら、新しい ID を作って保存する", () => {
    const { visitor, cookies } = setup({ storage: { [CONSENT_KEY]: "granted" } });
    expect(visitor.getVisitorId()).toBe(ID1);
    expect(cookies.writes).toEqual([`abdoc_vid=${ID1}; ${VISITOR_COOKIE_ATTRIBUTES}`]);
    // 以後は保存した ID を使う
    expect(visitor.getAssignmentId()).toBe(ID1);
    expect(cookies.writes).toHaveLength(1);
  });

  test("同意済みで Cookie の値が壊れていても、新しい ID を作って保存する", () => {
    const { visitor, cookies } = setup({ storage: { [CONSENT_KEY]: "granted" }, cookies: { abdoc_vid: "broken" } });
    expect(visitor.getAssignmentId()).toBe(ID1);
    expect(cookies.jar.get("abdoc_vid")).toBe(ID1);
  });
});

describe("選び直し（AC3）", () => {
  test("同意 → 拒否: abdoc_vid を消し、getVisitorId は null。表示中の割り当て ID は変わらない", () => {
    const { visitor, cookies, storage } = setup({ storage: { [CONSENT_KEY]: "granted" }, cookies: { abdoc_vid: ID3 } });
    expect(visitor.getAssignmentId()).toBe(ID3);

    visitor.setConsent("denied");

    expect(storage.data.get(CONSENT_KEY)).toBe("denied");
    expect(cookies.jar.has("abdoc_vid")).toBe(false);
    expect(cookies.writes.at(-1)).toMatch(/^abdoc_vid=; .*Max-Age=0/);
    expect(visitor.getVisitorId()).toBeNull();
    expect(visitor.getAssignmentId()).toBe(ID3);
  });

  test("拒否 → 同意: 一時 ID を保存する", () => {
    const { visitor, cookies } = setup({ storage: { [CONSENT_KEY]: "denied" } });
    const id = visitor.getAssignmentId();
    visitor.setConsent("granted");
    expect(cookies.jar.get("abdoc_vid")).toBe(id);
    expect(visitor.getVisitorId()).toBe(id);
  });
});

describe("localStorage / Cookie が使えない", () => {
  const throwingStorage: StorageLike = {
    getItem: () => {
      throw new Error("SecurityError");
    },
    setItem: () => {
      throw new Error("QuotaExceededError");
    },
  };

  test("localStorage が例外を投げても、エラーにならず選択をページ内で保つ", () => {
    const { env } = setup();
    const visitor = createVisitor({ ...env, storage: () => throwingStorage });
    expect(visitor.getConsent()).toBeNull();
    visitor.setConsent("granted");
    expect(visitor.getConsent()).toBe("granted");
    expect(visitor.getVisitorId()).toBe(ID1);
  });

  test("localStorage の取得自体が例外・undefined でも動く", () => {
    const { env } = setup();
    const throwing = createVisitor({
      ...env,
      storage: () => {
        throw new Error("SecurityError");
      },
    });
    expect(throwing.getConsent()).toBeNull();
    expect(throwing.getAssignmentId()).toBe(ID1);

    const missing = createVisitor({ ...env, storage: () => undefined });
    expect(missing.getAssignmentId()).toBe(ID2);
  });

  test("Cookie の読み書きが例外でも、一時 ID で割り当てを続ける", () => {
    const { env } = setup({ storage: { [CONSENT_KEY]: "granted" } });
    const visitor = createVisitor({
      ...env,
      cookies: {
        read: () => {
          throw new Error("SecurityError");
        },
        write: () => {
          throw new Error("SecurityError");
        },
      },
    });
    expect(visitor.getAssignmentId()).toBe(ID1);
    expect(visitor.getAssignmentId()).toBe(ID1);
  });
});

describe("getVisitorId（AC5: 後続の Issue が使う公開 API）", () => {
  test("ブラウザの localStorage / document.cookie を使い、同意済みなら ID、それ以外は null", async () => {
    const storage = memoryStorage();
    const cookies = cookieJar();
    const document = {
      get cookie() {
        return cookies.read();
      },
      set cookie(value: string) {
        cookies.write(value);
      },
    };
    vi.stubGlobal("window", { localStorage: storage });
    vi.stubGlobal("document", document);
    vi.resetModules();
    try {
      const { getVisitorId, visitor } = await import("../src/lib/visitor");
      expect(getVisitorId()).toBeNull();
      const id = visitor().getAssignmentId();
      expect(cookies.writes).toEqual([]);

      visitor().setConsent("granted");
      expect(getVisitorId()).toBe(id);
      expect(cookies.jar.get("abdoc_vid")).toBe(id);
      expect(storage.data.get(CONSENT_KEY)).toBe("granted");
      // スクリプトごとに別々に読み込まれても同じ Visitor（一時 ID）を共有する
      vi.resetModules();
      const again = await import("../src/lib/visitor");
      expect(again.visitor()).toBe(visitor());
    } finally {
      Reflect.deleteProperty(globalThis, Symbol.for("abdoc:visitor"));
      vi.unstubAllGlobals();
    }
  });
});
