# ChampionCalc

Pokémon Champions専用ダメージ計算Webアプリ。**Phase 0の環境確認は完了。Phase 1の契約コードは実装済みですが、実データ全件の意味整合は未完了**です。計算エンジン、ランキング取得運用、通常/TOP50の入力画面、認証、個人保存は後続フェーズです。共有URL機能は実装しません。

開発用ページは未実装状態を明示し、架空の順位やダメージを配信しません。自動テストの合格はゲーム本体との一致を意味しません。P0-04/P0-05/P0-06・権利・セキュリティの公開ゲートは未通過です。

## 起動

Node.js **24.22.1**、pnpm **12.15.0**を使用します。

```sh
nvm use
corepack pnpm install --frozen-lockfile
pnpm dev
```

開発ページ: http://127.0.0.1:3000 。Phase 0/1は環境変数や外部サービスがなくても動きます。将来の環境変数名は `.env.example` を参照してください。secret/service role鍵を `NEXT_PUBLIC_*` に置かないでください。

## 検証

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm contracts:check
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

E2Eは本番ビルドを127.0.0.1:3100で起動し、PC/375pxのChromiumを確認します。実スマートフォンやゲーム本体の検証ではありません。CI定義は `.github/workflows/ci.yml`。リモートCI自体はまだ実行していません。

## 共通契約

- `src/lib/contracts/schemas.ts`: strictな保存DTOとAPIの構造。ZodからTypeScript型を導出。
- `src/lib/contracts/master.ts`: マスター・フォーム・単一性格ベクトル・効果/出典契約。本番ゲームデータは未収録。
- `src/lib/contracts/validation.ts`: マスター/版/合法特性/snapshot/override照合、UTF-8容量検証。
- `contracts/openapi.yaml`: スキーマから生成したAPI契約。HTTP APIは後続実装。
- `contracts/README.md`: 利用方法、構造検証と意味検証の区別、設計の補足。

契約変更時は `pnpm contracts:generate` を実行します。APIや計算へ渡す前には構造schemaだけでなく `createContractValidator` を必ず使用してください。

## Supabase

CLIとSDKは固定バージョンを導入済み。`supabase/config.toml` はローカル専用です。既存プロジェクトとの衝突を避け、API 55321 / DB 55322 / Studio 55323 / メール確認 55324 を使用します。新規テーブルの自動公開は無効です。baseline migration・RLSはPhase 3で追加します。

```sh
pnpm exec supabase start
```

2026-10-24にローカル起動（PostgreSQL 17.11）を確認しました。DBの一時テーブルによる制約/RLSプローブと、Authの認証リンク・本人確認・ログアウト・refresh失効が成功しています。アプリ用baseline/テーブル/RLSは未作成です。Google OAuthとアプリ画面を通した認証は未検証です。

検証の再実行は `pnpm audit:local docs/validation/phase-0-1-local-supabase.json`。対象のlocalhost:55321以外には接続せず、テーブル検査はROLLBACK、ユーザーはその実行が作成したものだけを片付けます。`db reset`や既存データの削除は行いません。

実データは `pnpm audit:fetch` → `pnpm audit:external <一時cacheのパス> <結果JSONのパス>` で監査できます。再取得前に出典の最新利用条件を確認し、生JSONは検証後に削除してください。公開用のデータ取得機能ではありません。

## 設計と記録

- `design/champions-codex-handoff-v1.0/START_HERE.md`: 正式設計資料。77ファイルのSHA-256一致を確認済み。
- `docs/implementation-plan.md`: スコープ・構成・Phase 0〜8の順序。
- `docs/phase-0-1-report.md`: 初回実装の変更・試験結果・制限。
- `docs/release-audit.md`: 実機確認と公開ブロッカー。

原本の旧共有記述は参考に残りますが、製品の実装対象ではありません。現在はPhase 0・1の確認を優先し、Phase 2へは進んでいません。本番デプロイ・課金設定の変更は別途承認が必要です。
