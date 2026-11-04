import { describe, expect, test, vi } from "vitest";
import { CONSENT_KEY, type Consent, createVisitor, type VisitorEnv } from "../src/lib/visitor";

const ID1 = "11111111-1111-4111-8111-111111111111";

function setup(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const env: VisitorEnv = {
    storage: () => ({
      getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => {
        data.set(key, value);
      },
    }),
    cookies: { read: () => "", write: () => undefined },
    randomUUID: () => ID1,
  };
  return createVisitor(env);
}

describe("onConsentChange（#26 AC8 のための同意変更の通知）", () => {
  test("setConsent のたびに、保存後の状態で選択を通知する", () => {
    const visitor = setup();
    const seen: [Consent, Consent | null, string | null][] = [];
    visitor.onConsentChange((consent) => seen.push([consent, visitor.getConsent(), visitor.getVisitorId()]));

    visitor.setConsent("granted");
    visitor.setConsent("denied");

    expect(seen).toEqual([
      ["granted", "granted", ID1],
      ["denied", "denied", null],
    ]);
  });

  test("戻り値を呼ぶと、以後は通知しない", () => {
    const visitor = setup({ [CONSENT_KEY]: "denied" });
    const listener = vi.fn();
    const unsubscribe = visitor.onConsentChange(listener);

    visitor.setConsent("granted");
    unsubscribe();
    unsubscribe(); // 2 回呼んでも問題ない
    visitor.setConsent("denied");

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith("granted");
  });

  test("複数の購読者すべてに通知し、1 つが例外を投げても他と setConsent は止まらない", () => {
    const visitor = setup();
    const first = vi.fn(() => {
      throw new Error("boom");
    });
    const second = vi.fn();
    visitor.onConsentChange(first);
    visitor.onConsentChange(second);

    expect(() => visitor.setConsent("granted")).not.toThrow();
    expect(first).toHaveBeenCalledWith("granted");
    expect(second).toHaveBeenCalledWith("granted");
    expect(visitor.getConsent()).toBe("granted");
  });

  test("同じ関数を 2 回購読しても、解除はそれぞれ独立", () => {
    const visitor = setup();
    const listener = vi.fn();
    const off1 = visitor.onConsentChange(listener);
    visitor.onConsentChange(listener);

    off1();
    visitor.setConsent("granted");

    expect(listener).toHaveBeenCalledTimes(1);
  });

  test("購読するだけでは通知しない（読み込み時の状態は getConsent で読む）", () => {
    const visitor = setup({ [CONSENT_KEY]: "granted" });
    const listener = vi.fn();
    visitor.onConsentChange(listener);
    expect(listener).not.toHaveBeenCalled();
  });
});
