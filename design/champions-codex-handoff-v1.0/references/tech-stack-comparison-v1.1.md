# Pokémon Champions ダメージ計算アプリ — 技術スタック比較・選定理由 v1.1

- **更新日**：2026-10-23
- **位置づけ**：アーキテクチャ v1.0 を比較評価により再審査した設計資料（実装前）
- **前提**：要求・要件定義 v0.3 / 確定UI v0.5
- **結論**：**Next.js (React) + TypeScript + Tailwind CSS + shadcn/ui + Supabase (Postgres/Auth/Cron) + Vercel** を第一候補として維持する。ただし、**React + Vite + Supabase** も用途に適合する有力な代替構成である。

> これは「最速」「最安」の断言ではない。開発工数、継続運用、機能の整合性を重視した現時点の判断。バージョン・料金・利用規約は着手時に再確認する。

## 1. プロジェクト固有の判断基準

| 評価観点 | 要件・判断基準 | 重要度 |
|---|---|---|
| 計算正確性 | Champions独自の補正・端数処理、特殊技のテスト、未対応の明示 | 最重要 |
| 計算体感 | 最大4技×50匹＝200組を変更に応じて素早く再計算 | 最重要 |
| 状態管理 | TOP50詳細の技・戦闘条件は一時的、型編集は一覧に反映 | 高 |
| データ管理 | シングル/ダブル、シーズン、順位、推定代表型、版情報 | 高 |
| 定期更新 | 09:30 JSTに毎日1回、成功時のみ新スナップショットに切替 | 高 |
| 認証と共有 | 匿名計算、アカウント保存・同期、共有URL、RLS等の保護 | 高 |
| 画面の再現性 | UI v0.5、スマホでの検索式候補・固定タブ・密な一覧 | 高 |
| 開発・運用コスト | 個人開発で採用可能な実装負荷、障害切り分けの容易さ | 高 |
| SEO・SSR | 共有URLのプレビューや直接アクセスは有用、計算ページ本体はSSR必須でない | 中 |

### 判断の前提
- ダメージ計算は**基本的にブラウザ内**で実行する。サーバーとの往復が高速化の前提ではない。
- 計算ロジックはUIに依存しない `packages/calc-core` に分離する。React／Next.js以外からも実行可能にする。
- ダメージ計算エンジンの正確性はフレームワーク選択だけでは保証されず、ルール表・補正順・端数処理・テストケースが決定的である。
- 統計元APIから正確なTOP50順位・完全な最多採用構成を得られるかは別途技術検証する。

## 2. Webフレームワークの比較

| 候補 | 強み | 弱み・注意点 | 今回の適合 |
|---|---|---|---|
| **Next.js + React（採用候補）** | App Router、共有リンクのサーバー表示、認証導線、API/初期取得を統合。ReactでUI v0.5を実装 | サーバー/クライアント境界、キャッシュ、ホスティングに伴う複雑さ。200組の計算自体は改善しない | **高**：保存・共有の成長余地がある |
| React + Vite + React Router | クライアント中心の構成が簡潔。静的配信可能。UI入力・計算を中心にするなら十分 | 保存、共有、認証、外部API保護はSupabaseなど別サービスに責務を持たせる。共有OG表示には工夫 | **高**：初期実装は最もシンプルになりうる |
| React Router Framework | ルートのloader/action、SPA/SSR/静的出力を選べ、Reactのまま構成できる | Next.jsと異なるルーティング・デプロイ習熟が必要 | **高**：有力な代案 |
| SvelteKit | UIの状態更新を簡潔に表現可能、SSRにも対応 | 確定モックからのReact系UI設計に使う資産を移しづらい | 中：好み・経験が合えば選択可能 |

**選定理由**：保存画面、ログイン、共有URLの直接アクセス、将来のデータのサーバー描画まで一体として設計できることから、今回はNext.jsを選ぶ。一方、主機能は完全なクライアントサイドで成立するため、開発開始前に「SSR不要」「共有URLはクライアント復元だけでよい」と決めるなら**Vite + Reactへ変更する理由が十分にある**。Next.jsを「パフォーマンスがよいから」と選ばない。

**運用原則**：Next.jsであっても計算部分はClient Componentのみ。マスターデータは静的・版管理配信、共通ルールはcalc-coreへ。Server Componentはルート初期表示や認証・共有データの取得に限定。

## 3. 言語と計算エンジン

| 候補 | メリット | デメリット | 判断 |
|---|---|---|---|
| **TypeScript（採用）** | データの版、技分類、結果の状態（正常/入力不正/未対応）を型で区別。UIとエンジンで共有可能 | 実行時の入力検証を別途必要とする | 最適 |
| JavaScript | 初期記述は短い | 特殊な補正や型編集で誤入力・仕様の取り違えをコンパイル時に検出しにくい | 不採用 |
| Rust/WASM | 特定の重い計算を最適化できる余地 | ビルド・デバッグ・型の連携が増え、200件程度には過剰である可能性 | 性能測定で必要と判明した場合のみ検討 |
| Go等のサーバー計算 | 端末性能によらずバックエンドで動かせる | 入力のたびに通信、サーバー費用・障害依存が増える | 現時点では不採用 |

**採用方式**：純粋TypeScriptモジュール + Vitestによるテスト。16通りの乱数・撃破確率はルールに基づく。性能が問題になったときはまず計算結果キャッシュ・差分計算・Web Worker・一覧の仮想化を検討し、WASM化は最後に判断する。

## 4. UI・フォーム・状態管理の比較

| 領域 | 採用候補 | 比較対象 | 採用理由と留意点 |
|---|---|---|---|
| スタイル | **Tailwind CSS** | CSS Modules、CSS-in-JS | UI v0.5の細かな余白や密なレイアウトを統一しやすい。過剰なクラスは再利用コンポーネントに閉じ込める |
| コンポーネント | **shadcn/uiを基礎に必要な部品を自作** | MUI、Chakra UI、自作のみ | HPバー、検索候補、詳細Sheet、±1入力など独自ルックを再現しやすい。コンポーネントの更新保守は自分で担う |
| フォーム検証 | **Zod + React Hook Form（必要箇所）** | Formik、独自検証 | 能力ポイント上限や保存時の入力値の検証に適する。1刻み入力はcontrolled stateで実装する場合もある |
| 一時編集状態 | **React局所状態 / Zustand（共有が必要になったら）** | Redux Toolkit、Contextのみ | TOP50の共通条件・詳細Draft・防御側Overrideを分離。小さい間はZustandを必須にしない |
| サーバーデータ | **Next.jsの取得機能を優先、必要ならTanStack Query** | 全取得を独自fetch、SWR | ランキング更新やユーザー設定のキャッシュ無効化が必要な場面に限り追加し、重複状態を増やさない |

**重要**：候補リストのUIはキーボード・タッチ双方で操作できること、ポケモン/技の候補・効果・追加効果率を表示することを検証する。

## 5. データベース・認証の比較

| 候補 | 強み | 弱み・注意点 | 判断 |
|---|---|---|---|
| **Supabase PostgreSQL + Auth（採用）** | リレーショナルなランキング・型・保存データを扱いやすい。Auth、RLS、Cronの統合 | SQL、RLS/GRANT、サービス鍵の保護、Freeプラン停止・利用枠管理が必要 | **高** |
| Firebase Auth + Firestore + Functions | 認証とフロント連携が得意、ドキュメント単位の同期に向く | データの関係、シーズン別統計などのJOINに相当する処理をアプリ側で設計する必要。複合索引・従量利用の管理 | 中〜高 |
| Neon Postgres + Auth/Functions等 | PostgreSQLを使いつつバックエンド構成や分岐環境を柔軟に選べる。2026年時点で関連サービスも整備 | 必要な機能とCron連携、導入手順、統合運用を個別に評価する必要 | 高（有力代替） |
| 自前PostgreSQL + Node API | 完全に自由なAPI・認可・スケジューラを設計可能 | サーバー監視、認証、バックアップ、パッチ、権限管理を自分で抱える | 初期段階では不採用 |

**選定理由**：ランキング→50件の項目→実測・推定代表型→保存設定という関係をSQLで表しやすい。アカウント同期にはPostgreSQLと一体のSupabase Auth/RLSが合う。ただし、**RLSだけで十分とせずGRANTも設定**し、共有用レコードは公開範囲を厳密に限定する。

**費用上の注意**：Supabase Freeは低利用時に一時停止されうる。9:30更新を安定運用する段階でPro移行を含め再評価。容量、通信量、認証メール配信などの上限を監視する。

## 6. 毎朝09:30の更新処理の比較

| 候補 | メリット | 制約・リスク | 今回の判断 |
|---|---|---|---|
| **Supabase Cron + Edge Function（採用）** | DBと実行履歴を一体管理。HTTP経由で外部統計を取得・変換可能 | ジョブ起動の厳密な秒単位保証はない。実行時間やFree停止に注意 | 第1候補 |
| Vercel Cron | Webと同じデプロイ上で設定できる | Hobbyでは日次の実行が指定した時間帯のどこかになる。09:30の試行要件には不向き | Hobbyでは不採用。Proなら再検討 |
| Cloudflare Cron Triggers | UTC指定の定期実行、外部API呼び出しをWorkerで管理可能 | インフラが1つ増え、運用・権限分離が必要 | 良い代替 |
| Firebase Scheduled Functions | Cloud Schedulerとの統合がある | Firebase/GCPの追加設定と課金管理が必要 | Firebase採用時に有力 |
| GitHub Actions schedule | リポジトリで管理しやすい | 実行遅延・実行不可を前提とした本番運用に向きにくい | 開発時の補助程度 |

**ジョブ仕様**：JST 09:30 = UTC 00:30。UTC設定の環境では `30 0 * * *` を1日1回設定。外部データが更新されていなくてもAPI取得の試行は1回実施する。複数起動やタイムアウトによる重複書き込みは冪等キー・ロックで防止する。成功したデータだけactiveスナップショットへ切り替え、失敗時は旧データを維持。自動再試行はしない。

**要件の表現**：「09:30にジョブ開始を試みる」ことと「09:30までに最新データが反映される」ことは異なる。後者はAPI取得元の公開時刻に依存し、保証しない。

## 7. 配信・デプロイの比較

| 候補 | 長所 | 短所・確認点 | 判断 |
|---|---|---|---|
| **Vercel（採用）** | Next.jsとの統合、Git連携、プレビュー環境、SSRと共有ルートの展開が容易 | Hobbyは**個人・非商用限定**。有償化/広告など商用化時はプラン見直し。Supabaseと2サービス運用 | 第一候補 |
| Cloudflare Workers/Pages | グローバル配信、Workers・Cronなどと連携 | Next.js固有機能の互換レイヤーを検証。開発/運用の違いを学ぶ必要 | 静的SPAやWorkers寄りなら有力 |
| Netlify | Git連携、SSR/Functions、フォーム等の統合 | Next.jsの実際の機能対応や利用量を検証する必要 | 代替候補 |
| 自前VPS/コンテナ | 任意の実行環境と可搬性 | セキュリティ更新・監視・ネットワーク管理が必要 | 初期段階では採用しない |

**条件**：収益化・広告・スポンサー・法人運用をする場合、Vercel Hobbyの利用規約を再確認して必要なら有料プランまたは別配信先へ変更する。WebサイトとDBのサービスは契約上・技術上独立に移行できるように設計する。

## 8. テスト・管理ツールの比較

| 領域 | 選択 | 比較対象 | 理由 |
|---|---|---|---|
| ロジック単体テスト | **Vitest** | Jest | TypeScriptモジュールの高速反復、Jest互換に近い操作。Next.jsだからJest必須ではない |
| E2E・ブラウザ | **Playwright** | Cypress | Chromium/Firefox/WebKit、PC・スマホ画面の操作と導線を検証できる |
| DB・権限 | **SQL/統合テスト** | 手動テストのみ | RLS/GRANT、共有リンクと保存データのアクセス制御を検証 |
| パッケージ管理 | **pnpm workspace** | npm workspaces、Yarn、Bun | Webとcalc-coreの複数パッケージ管理。小規模ならnpm workspacesでも問題なし |

**試験対象**：Champions実測/既知の計算例、16乱数の端数処理、固定ダメージ・特殊技、確定n発/乱数n発、能力ポイント逆算・不正値、TOP50詳細の一時条件破棄、通常計算への引継ぎ、共有URL再現、RLS、スマホUI。

## 9. 最終推奨構成（いま採用する案）

```text
Browser（PC/スマホ）
  ├─ Next.js / React UI（Tailwind CSS + shadcn/ui）
  ├─ 計算条件の局所状態（必要ならZustand）
  ├─ packages/calc-core（TypeScript・純粋関数）
  └─ キャッシュ済みマスターデータ
           │ 認証、ランキング、保存、共有
           ▼
Supabase Auth + PostgreSQL（RLS/GRANT）
  └─ Cron（JST 09:30）→ Edge Function → 外部統計API
                                       ↓
                        妥当性検証 / 推定 / スナップショット

Next.js → Vercelへデプロイ
```

### 採用の条件と後戻り可能性
1. Next.jsを選んでも、計算エンジンはReact/Next.jsに依存させない。
2. 200組の計算が端末上で遅ければWeb Worker・表示の仮想化を検討する。TypeScriptで不足した場合のみWASM等を検討する。
3. 更新が不安定なら、Cron実行基盤をCloudflare等へ独立移行できるよう、データ取得処理をHTTPジョブ化する。
4. 実際に使う共有ルートにSSRが不要と判明し、開発負荷が無視できなければReact + Viteへの切り替えを認める。
5. Supabaseの料金・停止条件・RLS設定に問題が出た場合、PostgreSQL自体を維持しつつ別運用へ移行できるようSQL/マイグレーションを残す。

## 10. 導入前の小規模検証（PoC）

| No. | 検証項目 | 結果の判断基準 |
|---|---|---|
| POC-01 | 既知ダメージ20ケースをcalc-coreで再現 | 補正順・16乱数・端数処理が期待値と一致 |
| POC-02 | 4技×50匹の再計算とUI反映 | 中級スマホを含む実測値を取得、暫定3秒以内目標に照合 |
| POC-03 | TOP50詳細の一時設定 | 技/戦闘条件は閉じると破棄、型変更は一覧反映、通常計算へは全部引継ぎ |
| POC-04 | ランキングAPI | シングル/ダブルのTOP50を正確に特定できるか、取得元時刻と出典を確認 |
| POC-05 | 代表型推定 | 実測/推定を明示、違法構成を生成しない |
| POC-06 | Supabase Auth + RLS/GRANT | ユーザーAの保存設定をBが取得/変更できない |
| POC-07 | URL共有 | ログイン不要で共有スナップショットを再現。非公開データは含まない |
| POC-08 | Cron | JST09:30スケジュールで起動・ログ・失敗時据置・重複排除を確認 |
| POC-09 | Vercel配信 | 直接URLアクセス、ログイン復帰、PC/スマホ表示を確認 |

## 11. 公式資料・確認済み情報

- Next.js Server/Client Components: https://nextjs.org/docs/app/getting-started/server-and-client-components
- React Router modes: https://reactrouter.com/start/modes
- Vite guide: https://vite.dev/guide/
- shadcn/ui docs: https://ui.shadcn.com/docs
- MUI customization: https://mui.com/material-ui/customization/how-to-customize/
- Supabase Auth: https://supabase.com/docs/guides/auth
- Supabase Database/RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase Cron: https://supabase.com/docs/guides/cron
- Supabase scheduling functions: https://supabase.com/docs/guides/functions/schedule-functions
- Supabase free plan pausing: https://supabase.com/docs/guides/platform/free-project-pausing
- Firebase Firestore data model: https://firebase.google.com/docs/firestore/data-model
- Neon backend GA: https://neon.com/blog/neon-backend-is-ga
- Vercel Cron plan differences: https://vercel.com/docs/cron-jobs/usage-and-pricing
- Vercel service terms/Hobby: https://vercel.com/legal/terms
- Cloudflare Cron Triggers: https://developers.cloudflare.com/workers/configuration/cron-triggers/
- Vitest comparisons: https://vitest.dev/guide/comparisons
- Playwright intro: https://playwright.dev/docs/intro

**結論**：採用候補は前回から大きく変えないが、Vite/React Router・Neon・Cloudflareを現実的な代替案とし、Next.js、Supabase、Vercelの採用に伴う複雑さや利用制限まで判断記録に残す。
