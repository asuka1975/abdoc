interface ImportMetaEnv {
  /** BE の API ベース URL（例: `/api`）。Firebase Hosting では `/api/**` が Cloud Run へリライトされる。 */
  readonly PUBLIC_API_BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
