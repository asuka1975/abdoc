/**
 * 訪問者 ID と Cookie の同意（クライアント側）。
 * - 同意の選択は `localStorage` の `abdoc:consent`（`granted` / `denied`）に保存する。
 * - 同意済みなら訪問者 ID を Cookie `abdoc_vid` に保存する。期限切れなどで Cookie が無ければ新しい ID を作る。
 * - 未同意・拒否のときは、ページを表示している間だけ一時 ID をメモリに持ち、Cookie は書かない。
 *   同意した時点で、その一時 ID を Cookie に保存する（表示中の A/B の版が変わらないように）。
 * ブラウザ API には直接依存せず、ストレージ・Cookie・ID の生成を注入できるようにしてある（単体テストのため）。
 */

export type Consent = "granted" | "denied";

export const CONSENT_KEY = "abdoc:consent";
export const VISITOR_COOKIE = "abdoc_vid";
/** 訪問者 ID の Cookie の属性（1 年。JS から読むので `HttpOnly` は付けない） */
export const VISITOR_COOKIE_ATTRIBUTES = "Path=/; Secure; SameSite=Lax; Max-Age=31536000";

/** `localStorage` のうち、ここで使う部分だけ */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** `document.cookie` 相当（読むと `name=value; ...`、書くと 1 件追加・上書き） */
export interface CookieJar {
  read(): string;
  write(cookie: string): void;
}

export interface VisitorEnv {
  /** `localStorage` を返す。使えない（例外・undefined）ときは同意をページ内のメモリだけで持つ */
  storage: () => StorageLike | undefined;
  cookies: CookieJar;
  randomUUID: () => string;
}

export interface Visitor {
  /** 保存済みの同意の選択。未選択なら `null` */
  getConsent(): Consent | null;
  /** 同意の選択を保存する。`granted` なら今の ID を Cookie に保存し、`denied` なら Cookie を消す */
  setConsent(consent: Consent): void;
  /** A/B の割り当てに使う ID（同意済みなら Cookie の ID、それ以外は一時 ID）。常に値を返す */
  getAssignmentId(): string;
  /** 同意済みならその訪問者 ID、そうでなければ `null`（記録・送信はこちらを使う） */
  getVisitorId(): string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseConsent(value: string | null | undefined): Consent | null {
  return value === "granted" || value === "denied" ? value : null;
}

/** Cookie 文字列から `abdoc_vid` を取り出す。無い・UUID でない値は `null` */
export function readVisitorCookie(cookie: string): string | null {
  for (const part of cookie.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name !== VISITOR_COOKIE) continue;
    const value = rest.join("=");
    return UUID.test(value) ? value : null;
  }
  return null;
}

export function createVisitor(env: VisitorEnv): Visitor {
  let storage: StorageLike | undefined;
  try {
    storage = env.storage();
  } catch {
    storage = undefined;
  }
  let memoryConsent: Consent | null = null;
  let temporaryId: string | undefined;

  function getConsent(): Consent | null {
    if (memoryConsent) return memoryConsent;
    try {
      return parseConsent(storage?.getItem(CONSENT_KEY));
    } catch {
      return null;
    }
  }

  function cookieId(): string | null {
    try {
      return readVisitorCookie(env.cookies.read());
    } catch {
      return null;
    }
  }

  function writeCookie(id: string) {
    try {
      env.cookies.write(`${VISITOR_COOKIE}=${id}; ${VISITOR_COOKIE_ATTRIBUTES}`);
    } catch {
      // 保存できなくても一時 ID で表示を続ける
    }
  }

  function temporary(): string {
    temporaryId ??= env.randomUUID();
    return temporaryId;
  }

  /** 同意済みのときの ID。Cookie が無ければ（期限切れなど）今の一時 ID を新しい訪問者 ID として保存する */
  function grantedId(): string {
    const saved = cookieId();
    if (saved) {
      temporaryId = saved;
      return saved;
    }
    const id = temporary();
    writeCookie(id);
    return id;
  }

  return {
    getConsent,
    setConsent(consent) {
      // 先に今の ID を確定させておく（拒否に切り替えても表示中の版を変えない）
      const id = getConsent() === "granted" ? grantedId() : temporary();
      memoryConsent = consent;
      try {
        storage?.setItem(CONSENT_KEY, consent);
      } catch {
        // 保存できなくてもこのページの間は選択を保つ
      }
      if (consent === "granted") {
        writeCookie(id);
      } else {
        try {
          env.cookies.write(`${VISITOR_COOKIE}=; Path=/; Secure; SameSite=Lax; Max-Age=0`);
        } catch {
          // 消せなくても以後は読まない
        }
      }
    },
    getAssignmentId() {
      return getConsent() === "granted" ? grantedId() : temporary();
    },
    getVisitorId() {
      return getConsent() === "granted" ? grantedId() : null;
    },
  };
}

/** `crypto.randomUUID()`。安全でないコンテキスト（http）で使えないときは `getRandomValues` で v4 UUID を作る */
function browserRandomUUID(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * ページで 1 つの `Visitor` の置き場所。Astro はスクリプトごとにこのモジュールを別々にバンドル・インライン化しうるので、
 * モジュール変数でなく `window` に持つ（一時 ID を記事とバナーで共有するため）。
 */
const VISITOR_SLOT = Symbol.for("abdoc:visitor");
const slots = globalThis as unknown as Record<typeof VISITOR_SLOT, Visitor | undefined>;

/** ブラウザの `localStorage` / `document.cookie` / `crypto` を使う、ページで 1 つの `Visitor` */
export function visitor(): Visitor {
  slots[VISITOR_SLOT] ??= createVisitor({
    storage: () => window.localStorage,
    cookies: {
      read: () => document.cookie,
      write: (cookie) => {
        document.cookie = cookie;
      },
    },
    randomUUID: browserRandomUUID,
  });
  return slots[VISITOR_SLOT];
}

/** 同意済みならその訪問者 ID、そうでなければ `null`（後続の計測・リアクション送信が使う） */
export function getVisitorId(): string | null {
  return visitor().getVisitorId();
}
