# Architecture Decision Records (ADR) v1.1 — Pokémon Champions 計算アプリ

- 更新日：2026-10-23
- 位置づけ：v1.0 ADRを比較検討を踏まえて更新
- ステータス：**条件付き採用**（外部統計APIと性能のPoC後に最終確定）
- 詳細な比較：[`tech-stack-comparison-v1.1.md`](./tech-stack-comparison-v1.1.md)

## ADR-001 Web: Next.js + React + TypeScript (条件付き採用)
- **選択**：Next.js App Router。計算部分はClient Component / 独立TSパッケージ。
- **選択した理由**：ログイン・保存・共有URL・初期データの取得を同じルーティング体系に集約しやすい。ReactでUI v0.5を実装可能。
- **比較した代替**：React + Vite（軽量、SPAには十分）、React Router Framework（SSR/SPA両用）、SvelteKit。
- **採用しない理由**：Viteの優位性は主にフロント中心の簡潔さで、今後の共有URLのサーバー処理などを優先。React Router Frameworkは同等の有力案だが採用スタックを増やす便益が明確ではない。
- **リスク/再検討**：Server/Client境界の複雑さと初期JS量。SSRを使わないことが確認できればViteへ変更可能。

## ADR-002 Calc: UI非依存のTypeScript `packages/calc-core` (採用)
- **選択**：ブラウザで純粋関数として計算。200組の変更時再計算はベンチマークし、必要ならWeb Worker。
- **比較した代替**：サーバー計算（往復/コスト）、Rust/WASM（ビルド難度）、JS（型安全性）。
- **理由**：通常計算とTOP50の同一ルール共有、16乱数の完全テスト、未対応効果の明示ができる。Next.jsの計算性能を特別視しない。

## ADR-003 UI: Tailwind + shadcn/ui +限定的状態管理 (採用)
- **比較した代替**：MUI（既存デザインシステムが強い）、CSS Modules＋自作（保守工数）、Redux Toolkit（用途に対し大きいことがある）。
- **理由**：確定UI v0.5の細かな検索UI/HPバー/詳細パネルを再現。詳細内一時条件は閉じると破棄し、育成型Overrideのみ残す。
- **条件**：Zod、React Hook Form、Zustand、TanStack Queryは使用箇所を見極めて段階的に追加。

## ADR-004 Data/Auth: Supabase PostgreSQL + Auth + RLS (条件付き採用)
- **比較した代替**：Firebase Auth＋Firestore（NoSQL）、Neon＋Auth/Functions等（Postgresで有力）、自前Postgres＋API（自由度は高いが運用負担）。
- **理由**：ランキング・バージョン・代表型・保存・共有データの関係をSQLで扱い、Authと行単位のアクセス権限を統合できる。
- **条件**：RLSに加えてGRANTを適切に設定し、秘密鍵をブラウザに出さない。無料プランの低利用停止に注意。

## ADR-005 Update: Supabase Cron + Edge Function (条件付き採用)
- **比較した代替**：Vercel Cron（Hobbyは時間帯内でずれる）、Cloudflare Cron Triggers（別基盤）、Firebase Cloud Scheduler（Firebase併用時）。
- **理由**：取得→検証→代表型推定→スナップショット切替をDBと近い場所で実装でき、ジョブ履歴を確認できる。
- **条件**：JST09:30の1日1回をUTC `30 0 * * *` で設定。秒単位の起動保証はしない。自動再試行なし、冪等化、失敗時は旧版を維持。

## ADR-006 Hosting: Vercel (条件付き採用)
- **比較した代替**：Cloudflare Workers/Pages、Netlify、VPS。
- **理由**：Next.jsのデプロイ、プレビュー環境、Git連携が容易。
- **条件**：Vercel Hobbyは個人・非商用に限定。広告・収益化・法人用途があるなら有料プランか別ホストを選択。公開規模や転送量に応じて評価し直す。

## ADR-007 Test: Vitest + Playwright + DB統合テスト (採用)
- **比較した代替**：Jest、Cypress、手動テストのみ。
- **理由**：計算ロジックの単体検証、PC/スマホE2E、権限テストを分離して実施。リグレッションしやすい特殊技対応を優先。

## ADR-008 TOP50 ranking: active snapshot と provenance (採用)
- **選択**：形式別にバージョンを持つactiveスナップショット。実測/推定代表型を区別し根拠を記録。
- **理由**：外部APIの更新失敗・統計粒度の不足をUIへ正しく反映する。
- **未検証**：正確なTOP50順位を外部APIから取得できるか、完全採用型の情報を得られるか。

## ADR-009 User data / Share: ACL付き保存とURLスナップショット (採用)
- **選択**：本人だけの保存設定と、公開可能な最小限の共有スナップショットを分離。
- **理由**：他端末の同期とURL共有を両立し、個人情報の意図しない公開を防ぐ。
- **条件**：共有トークンは推測困難、期限・失効・同時編集競合は実装前に詳細化。

## 今後の承認ゲート
1. TOP50の実際のAPIレスポンス検証
2. 200組の実機ベンチマーク
3. Auth/RLS/GRANTと共有リンクのアクセス制御テスト
4. ジョブの09:30設定・更新失敗時据置テスト
5. 収益化方針に応じたホスティング利用規約確認

## 結論
**構成はNext.js / TypeScript / Supabase / Vercelを維持。**「Next.jsが速いから」「無料で永久運用できるから」ではなく、画面・認証・保存・共有・日次データ連携を少人数で整合させられることを採用根拠とする。React + ViteやNeon/Cloudflareへの移行余地を意図的に残す。
