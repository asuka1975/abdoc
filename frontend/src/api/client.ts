import createClient, { type ClientOptions } from "openapi-fetch";
import type { paths } from "./generated/schema";

export type { components, paths } from "./generated/schema";

/** contracts/openapi.yaml から生成した型付きの API クライアントを作る。 */
export function createApiClient(options: ClientOptions = {}) {
  return createClient<paths>({ baseUrl: import.meta.env.PUBLIC_API_BASE_URL, ...options });
}

export type ApiClient = ReturnType<typeof createApiClient>;
