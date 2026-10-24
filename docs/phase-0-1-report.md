# Phase 0 / Phase 1 実装報告

## 2026-10-24 再確認結果（現在の判定）

Phase 2-B第3段階で [TOP50カバレッジ監査](phase-2b3-report.md)を追加した。別の上流生成版（2026-10-23T16:54:01.962Z）を観測し、固定マスターは従来と同じrevisionで比較。フォーム不足は14/12行、代表型特性の不足は6/5行（6/4種類）。代替特性の周辺分布ではDoublesにVital Spiritの追加不足もある。過去の取得記録と収録フラグは変更せず、Phase 1の実データ意味整合は未完了のまま。

今回の依頼に従いPhase 0・1の検証だけを実施。Phase 2、アプリ用DB baseline、ランキング取得運用、認証画面/保存APIの実装には進んでいない。

| 判定 | 根拠 |
|---|---|
| **Phase 0 完了** | 開発コマンドに加え、このプロジェクト専用のローカルSupabase起動、DB接続、制約/RLSの基盤プローブ、Auth基本動作を確認 |
| **Phase 1 未完了** | 契約コードと構造検証/拒否動作は成功。ただし、今回求められた実データの全件の意味整合は、マスター候補の不足・収録フラグ矛盾・未解決フォーム対応のため完了していない |

Phase 1の元の終了条件（DTO v1、違法build/条件拒否、共有APIなし）に関する自動検証は合格している。今回の判定では追加依頼の「実データの対応確認」も含め、全面的に整合したとは扱わない。これはP0-05/P0-06のゲーム本体との照合を実施したという意味ではない。

### 成功したローカル環境検証

- Docker Client/Server **29.5.2**、固定CLI **2.122.0**を確認。対象プロジェクトの既存コンテナ/ボリュームがないことを確認してから初回起動した。
- `supabase start --agent no --yes --debug` でイメージ取得と起動が完了。PostgreSQL **17.11**、Auth、Storage、Studio等の対象コンテナのhealthを確認。APIは **http://127.0.0.1:55321**、Studioは **http://127.0.0.1:55323**。対象ローカルサービスは起動中。
- 前回の無出力/未完了は再現状況が変わり、今回のログでは初回Dockerイメージ取得を経て正常起動した。`~/.supabase/profile`未検出のログは今回も出たが、起動を妨げなかった。これをログイン必須や根本原因とは断定しない。
- DBの既存状態を読み取り確認。`public`のアプリ用テーブル0、policy0、`supabase_migrations.schema_migrations`なし。Auth/Storage自身のmigration履歴は存在。**アプリ用baselineがないためアプリ固有のmigration適用やRLS試験は実施対象がない**。設計上はPhase 3の作業。
- `scripts/audit/local-database.sql` は一時テーブルのみでCHECK（0..32）、PK重複、FK不整合、匿名参照拒否、所有者の参照/更新、他人へのINSERTと所有権変更の拒否を検査。全体をROLLBACKし、検証テーブル残存0を確認。アプリのRLS完成を意味しない。
- ローカルAuthで新規の一意な`@example.test`ユーザーだけを作成し、認証リンク検証、本人確認、リンクの一度限りの使用、ログアウト、失効refreshの拒否、既存ユーザーのMagic Link再ログインを確認。SDKの鍵・JWT・リンクtokenはメモリ内だけで扱い、報告やコードへ保存していない。
- 最初のAuth検証は、新規ユーザー用リンクの実際の種別が`signup`なのに`magiclink`で検証したため`otp_expired`で失敗。発行された`verification_type`に従うよう**検証スクリプトを修正**し再検証成功。既存ユーザー向けの`magiclink`も別途成功した。アプリ側のAuthフローを実装/修正したわけではない。
- セッションを失効させた後、今回の検証が作成したユーザーだけを片付けた。Authユーザー数は前後0、publicテーブル一覧も不変。別プロジェクトのデータやコンテナは変更/停止していない。reset、drop、volume削除、既存ユーザー削除は行っていない。

証跡: `docs/validation/phase-0-1-local-supabase.json`。再実行: `pnpm audit:local docs/validation/phase-0-1-local-supabase.json`（Dockerと対象ローカルSupabaseの起動が必要）。

### 実データ検証の範囲と結果

取得は**2026-10-24 JST**、APIが示す生成日時は**2026-10-22T08:44:17.447Z**。取得日時と上流の生成日時は別に保持。HTTP公開APIの結果であり、ゲーム本体との一致は未検証。

| 検査 | 結果 |
|---|---|
| Battle Data API索引 | 263件取得。formの`showdown_name`/`saved_name`を保持し、似た名前を推測で同一視しない |
| TOP50の構造 | 元JSONは形式ごとに262件。上流positionに従い1〜50の50件へ射影し、両形式の順位連番・重複なし・フォーム識別を検査成功 |
| 共通Ranking DTO | 50行×2形式の構造検証成功。使用率と上流公開時刻は未提供のためnull。regulationIdは正式値がないため監査用未解決ラベルと明示 |
| setの構造・能力ポイント | 100型の全6能力・0..32整数・合計66以内の構造を検査成功。提供元生成コードで配列順を照合 |
| 生APIの能力ポイント | GarchompのSingles/Doubles各10行、計20行で明示された`*_points`列を検査成功。空欄や文字列を0に変換しない |
| マスターの共通契約 | 258フォーム・25性格・900技・191特性・583持ち物・258習得技表をローカル射影し構造検証成功。属性の出典hashを区別。全てprovisional、収録は未確認または元データの明示的なexcluded、全効果unsupportedを維持 |
| 持ち物/性格/技の名前参照 | 今回TOP50のsetで名前が辞書に存在しない持ち物・性格・技は0。ただし、Champions収録が承認済みという意味ではない |
| フォームのマスター参照 | **不成立**。候補マスターにSingles14件/Doubles12件が不足。マスター内でも`Paldean Tauros`/`Vivillon`はAPIフォームへ一意対応できない |
| 特性のマスター参照 | **不成立**。Singles6種類/Doubles4種類の特性が候補辞書にない。例えばGood as Gold等。既知フォームに限った特性割当の照合では不一致0だが、欠落フォームの合法性は判定不能 |
| 技の収録フラグ | **矛盾**。APIのTOP50 setにある技のうち候補マスターが`inChampions:false`とするものがSingles6種類/Doubles3種類ある。Make It Rain等。どちらが正しいかを推測で決定しない |
| 数値の意味 | GarchompのAPI metadata HPは183、別マスターの種族値HPは108。別の意味のフィールドとして扱い、API metadataをbaseStatsへ流し込まない。逆算式は実装しない |
| 意味検証・公開可否 | 両ランキングは未確認/未知フォーム等のため共通factoryで拒否。未承認データで`confirmed`/`verified`を作らず、代表型はnull/incompleteのまま。正式データ連携成功とは判定しない |

**重要な上流側の注意**: meta JSONの生成処理は能力ポイントの範囲補正/欠損時0や、性格欠損時Seriousを補う。metaの型がvalidでも生データが完全な証拠にはならない。生APIで照合したのはGarchompの2形式だけで、TOP50全種の生APIを巡回したわけではない。独立カテゴリのトップから作られた`set`を実測joint distributionとして扱わない。

証跡: `docs/validation/phase-0-1-external-data.json`。取得URL、取得時刻、SHA-256、観測commit、件数、欠落ID一覧を含む。生JSONや全順位一覧をリポジトリに保存/公開する恒久ミラーは作成しない。

今回取得した生データの一時cacheは検証後に削除済み。生成されたローカル鍵を含むSupabase起動ログも削除し、証跡JSONには鍵・JWT・ユーザー情報を含めていない。

### 利用条件・帰属

- [Battle Data API Rules](https://championsbattledata.com/api-rules/)を確認。今回の検証は少数のGETと一時cacheに限定し、生データの公開API/ダンプを作成していない。記録には **Battle data provided by [Pokémon Champions Battle Data](https://championsbattledata.com/)** と表示。画像/商標の許諾とは分ける。
- [Pokemon Champions Data Contributors](https://github.com/otterlyclueless/pokemon-champions-data) / [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)を確認。フィールド名・ID・性格ベクトルを検証用に加工したことを明示。READMEもChampions固有値の未確認を認めており、提供元の`championsVerified`フラグだけで本アプリの実機承認に昇格させない。
- metaの順序/合成方法は提供元の[builder-meta.mjs](https://github.com/Gheist23/pokemonbattledata/blob/main/tools/builder-meta.mjs)で確認した。外部コードは実行せず参照のみ。

再取得する場合は最新の利用条件を確認後、`pnpm audit:fetch`で一時cacheを作成し、表示されたパスを使って`pnpm audit:external <cache-dir> <summary.json>`を実行する。検証後はその実行で作った一時cacheだけを削除する。自動/定期取得は実装していない。

### 失敗・未実施・必要な操作

- **解消済みの環境問題**: Python 3.14の標準urllibはローカルCA不足でTLS検証に失敗。TLS検証を無効化せず、OS標準curlに切り替えて取得成功。ユーザーが証明書設定を変更する必要はない。
- **残るデータ問題**: 不足フォーム/特性、収録フラグ矛盾、フォームalias、regulation不明。提供元の修正や根拠付きの対応表/収録確認が必要であり、環境設定や秘密鍵では解決しない。自動的な最新データへの差し替えや推測による追加は行っていない。
- **未実装のため未実施**: アプリ用baseline・テーブル/制約/RLS、保存API、Next.js認証callback。本設計ではPhase 3/7の作業で、今回追加していない。
- **未接続のため未実施**: Google OAuth。メール配送/ブラウザcallbackの通し検証も未実施（今回はadmin生成したローカルリンクのAuth検証のみ）。本番Supabase/Vercelには接続していない。
- **継続して未検証**: P0-05/P0-06。ゲーム本体の画面証拠やダメージを今回取得/照合していない。
- **今すぐ必要なユーザー操作はなし**。Docker/Supabaseは起動済み。再起動後に必要な場合はDockerを起動し、作業フォルダで`nvm use` → `pnpm exec supabase start --agent no --yes`を実行する。既存データを消す`db reset`やvolume削除は実行しない。

### 今回の変更と再検証

- 追加: `scripts/audit/{external-mapping.ts,external-data.ts,fetch-external.mjs,local-supabase.ts,local-database.sql}`、`tests/external-audit.test.ts`、`docs/validation/`の2証跡JSON。監査用処理はアプリからimportせず、取得/公開機能へ転用していない。
- 更新: package.jsonの監査コマンド、README、公開監査台帳、本報告。共通DTOの制限を緩和する変更は行っていない。
- 追加4テストは曖昧フォームalias、性格対応、空欄の0化禁止、割合/時刻/代表型の捏造防止を検査。未実装で失敗することを先に確認してから実装した。
- 単体テスト **79件成功**、型チェック、Lint、OpenAPI整合検査、本番ビルド、PC/375pxのE2E **4件**が再実行でも成功。ローカルDB/Auth検査は上記の実サービスを使う別コマンドとして成功しており、79件の架空データ単体テストとは区別している。

---

## 2026-10-23 初回実装記録

記録日: 2026-10-23（JST）。初回依頼の範囲まで実装。正式な計算アプリの完成・公開は未達です。

## Phase 0

- 空のフォルダにローカルGit（main）を初期化。コミット・push・デプロイは未実施。
- ZIPを `design/` に展開し、START_HERE / CODEX_START_PROMPT / docs/00〜08 / contracts / reference-uiを確認。manifestの77件すべてSHA-256一致。原本を変更せず保持。
- Node 24.22.1 / pnpm 12.15.0、Next 16.4.3 App Router、React 19.3.1、TypeScript 5.9.3、Tailwind 4、shadcn/uiを導入。SDK・依存を完全固定しlockfileを作成。
- Vitest、Playwright（PC/375px）、ESLint、型チェック、ビルド、契約生成のコマンドとCIを導入。
- `.env.example`、secret除外、noindexの開発ページ、公開監査台帳を追加。架空のダメージやランキングは掲載しない。
- Supabase CLIでローカル設定を生成。別プロジェクトとの衝突を避け55320番台に分離。新規テーブル自動公開と空seed実行を無効化。
- **制限**: `supabase start`は無出力のまま完了せず、専用ポート/デバッグでも起動完了を確認できなかったため中断。debugにはprofile未検出の行があるが原因は未確定。対象コンテナの稼働未確認、実DB/Auth試験は未実施。既存の別プロジェクトは停止・変更していない。

## Phase 1

- Zodを単一正本に、保存DTO v1、全6能力、全5性格倍率・ランク、3態持ち物、条件、版情報、ランキング、API envelopeを実装。型を導出し、ハンドオフの参照型との一致を型検査。
- 構造だけでなく、既知/収録フォーム・性格ID/倍率一致・合法特性・既知技/道具・effect option・sourceVersionsを共通factoryで照合。
- 能力ポイント0..32整数/合計66、ランク−6..6、1..4技、最大50 override、1..50順位/重複、snapshot形式/行フォームの対応を検査。
- 保存payloadは数値のschema version 1のみ。未知キー、結果、UI一時state、isMega重複、旧版、不整合を拒否。UTF-8 250,000バイトを生JSONのparse前とobject検証時に制限。
- TOP50は最大50行、通常モードと同じBuild/条件を使用。未検証の時刻・使用率のnullを保持し、実測/推定/未完全を区別。
- `contracts/openapi.yaml` を生成し、APIの残存共有タグ/説明を除去。APIのHTTP実装や認証成功を装うstubは作成していない。
- 本番データは未登録。テストはすべて架空IDを使用。保存できる入力とエンジンが演算可能な入力の区別はPhase 2へ継続。

## 変更ファイル

| グループ | 主な追加ファイル |
|---|---|
| 設計原本 | design/champions-codex-handoff-v1.0/ 全ファイル |
| 基盤 | package.json、pnpm-lock.yaml、pnpm-workspace.yaml、.nvmrc、.npmrc、.gitignore、.env.example、tsconfig.json、next.config.ts、next-env.d.ts、eslint.config.mjs、postcss.config.mjs、components.json |
| 開発ページ | src/app/{layout.tsx,page.tsx,globals.css}、src/components/ui/{card,alert,badge}.tsx、src/lib/utils.ts |
| 契約 | src/lib/contracts/{schemas,master,validation}.ts、scripts/generate-openapi.ts、contracts/{openapi.yaml,README.md} |
| テスト/CI | tests/{fixtures.ts,contracts.test.ts,openapi.test.ts}、e2e/foundation.spec.ts、vitest.config.ts、playwright.config.ts、.github/workflows/ci.yml |
| ローカルDB設定 | supabase/config.toml（一時情報はルート.gitignoreで除外） |
| 説明/監査 | README.md、docs/{implementation-plan,release-audit,phase-0-1-report}.md |

## 試験結果

| 試験 | 結果 |
|---|---|
| RED確認 | 契約モジュール未実装による失敗、生成OpenAPI不在による失敗を先に確認 |
| pnpm install --frozen-lockfile | 成功 |
| pnpm peers check | 依存のpeer不整合なし |
| pnpm lint | 成功・警告0 |
| pnpm typecheck | 成功 |
| pnpm test | 75件成功 |
| pnpm contracts:check | 生成差分なし・OpenAPI参照整合成功 |
| pnpm build | 成功。/ と標準404のみ生成 |
| pnpm test:e2e | Chromium PC/375pxで4件成功。匿名の案内表示、未実装表示、横はみ出しなし、共有パス404 |
| screenshot確認 | PC/モバイルの案内ページを確認。本体UI v0.5の受入試験ではない |
| git ignore | .env.local / node_modules / .next / supabase一時情報が除外されることを確認 |
| Supabase DB/Auth/RLS | 起動未確認。実行時検証は未実施 |
| GitHub Actions | 定義のみ追加。リモート未実行 |
| P0-05 / P0-06 | ゲーム本体の検証は未実施 |

E2Eの初回はNext.jsの標準route announcerにもrole=alertがあるためlocatorが曖昧で失敗。main内に対象を限定して再実行し成功。初期依存インストールの不完全なフォルダは退避し、再インストールで解消。TypeScript 7 / ESLint 10はNextのLint依存のpeer範囲外だったため、対応する5.9.3 / 9.39.5に固定（ESLint 9は上流deprecated警告あり）。

## 判断・残作業

- 今回の画面は起動確認用。v0.5通常/TOP50の実装は設計順序どおりPhase 5/6。
- 最大HPとの比較はPhase 2の版付き算術に依存。契約層は正整数/nullまで確認し、未検証の暫定HP式を複製していない。
- カタログ証跡参照は真偽や利用許諾を保証しない。ランキングペアの構造整合は、シーズン/観測期間の比較可能性やゲーム内一致を保証しない。
- 詳細な契約補足は `contracts/README.md`。全公開ブロッカーは `docs/release-audit.md`。
- 当初の後続計画はPhase 2の共通計算コアだったが、現在はユーザーの指示により進めず、上記のPhase 0・1再検証を優先している。Supabase起動問題は今回解消し、実データの対応不足は継続管理する。

## 参照した公式技術資料

- [Next.js installation](https://nextjs.org/docs/app/getting-started/installation)
- [Supabase changelog](https://supabase.com/changelog.md)、[CLI](https://supabase.com/docs/guides/local-development/cli/getting-started)、[config](https://supabase.com/docs/guides/local-development/cli/config)
- [shadcn/ui Card](https://ui.shadcn.com/docs/components/radix/card)、[Alert](https://ui.shadcn.com/docs/components/radix/alert)、[Badge](https://ui.shadcn.com/docs/components/radix/badge)

自動テスト合格 ≠ ゲーム本体との一致 ≠ 公開承認。P0-05（100行順位照合）・P0-06（整数ダメージのL3実機証跡）を含む公開ゲートを満たすまで、正式公開や正確性の公称はしない。
