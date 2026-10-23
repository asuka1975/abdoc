// @ts-check
import eslintPluginAstro from "eslint-plugin-astro";
import tseslint from "typescript-eslint";

export default [
  { ignores: ["dist/", ".astro/", "node_modules/", "test-results/", "playwright-report/"] },
  ...tseslint.configs.strict,
  ...eslintPluginAstro.configs.recommended,
  // a11y: eslint-plugin-jsx-a11y は ESLint 10 未対応のため、互換フォーク eslint-plugin-jsx-a11y-x を使う
  ...eslintPluginAstro.configs["jsx-a11y-strict"],
];
