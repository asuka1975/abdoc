# AGENTS.md — `{{DIR}}/`（**まだコードが無い**）

このディレクトリは雛形待ちです。**ここに書かれていないことを推測しないでください。**
正は次の 2 つだけです。

1. `docs/PRODUCT.md` — 何を作るか、スタック、規約
2. 雛形 Issue の `<!-- factory:spec -->` コメント — 受け入れ基準

## 雛形を作るときの約束
- 最初の PR で、この AGENTS.md を **実コードに基づくコマンド表・構成・禁止事項** に書き換える（`.github/factory/templates/AGENTS.{{KIND}}.md` を叩き台にしてよいが、実際に動くコマンドだけを書く）
- `bash scripts/factory/setup.sh {{KIND}}` が素の checkout で通る状態にする（`scripts/factory/setup.sh` の `setup_{{KIND}}` を実態に合わせて直してよい）
- CI（`.github/workflows/ci-*.yml`）はマニフェストが置かれると自動で有効になる。緑にしてから PR を Ready にする
- `.env.example` と `README.md`（このディレクトリ用、起動手順 10 行）を置く
- 依存は最小。PRODUCT.md に無いライブラリ・サービスを足すときは PR 本文に理由を書く
