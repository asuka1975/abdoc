import { expect, expectTypeOf, test, vi } from "vitest";
import { createApiClient, type components } from "../src/api/client";

test("生成クライアントで GET /healthz を呼ぶと型付きの { status: 'ok' } が得られる（BE はモック）", async () => {
  const fetchMock = vi.fn<(request: Request) => Promise<Response>>(async () =>
    new Response(JSON.stringify({ status: "ok" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
  const client = createApiClient({ baseUrl: "http://api.test", fetch: fetchMock });

  const { data, error, response } = await client.GET("/healthz");

  expect(fetchMock).toHaveBeenCalledOnce();
  const request = fetchMock.mock.calls[0]?.[0];
  expect(request?.method).toBe("GET");
  expect(request?.url).toBe("http://api.test/healthz");
  expect(response.status).toBe(200);
  expect(error).toBeUndefined();
  expect(data).toEqual({ status: "ok" });
  expectTypeOf(data).toEqualTypeOf<components["schemas"]["Health"] | undefined>();
});
