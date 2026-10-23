# DBマイグレーション・受け入れテスト・Codex引き継ぎ v1.2

## 1. 移行方針

**旧migrationをそのまま順に本番へ流さない。** 既存`202610230001_initial_schema.sql`、`202610230002_rank_verification.sql`は実行未検証のドラフト。Codexには統合後の新規baseline DDLを作成させ、空の開発DBで最初から適用する。

提案構成：

```text
supabase/
  migrations/
    YYYYMMDD000001_initial_consolidated.sql  # DB v1.2正本から生成する初期SQL
    YYYYMMDD000002_security_and_rpc.sql       # RLS/GRANT/限定公開関数
    YYYYMMDD000003_cron_registration.sql      # 環境別に秘密情報を注入、運用時のみ有効化
  tests/
    db_constraints.test.sql
    db_rls.test.sql
    db_publication.test.sql
    db_update_policy.test.sql
    db_share_security.test.sql
```

ファイル名は提案であり、今はSQLファイルを生成・適用していない。既に開発DBへドラフトを適用していた場合は、テーブル実態を調査し、**データ破壊を避ける差分マイグレーション**を別途作成する。

## 2. 必須DDL・インデックス・関数契約

| 項目 | 必要な制約・インデックス／契約 |
|---|---|
| `ranking_entries` | PK `(snapshot_id,rank)`, UNIQUE `(snapshot_id,pokemon_id)`, rank CHECK(1..50) |
| `usage_options` | `(snapshot_id,pokemon_id,category,option_rank)`検索用インデックス、採用率0..1 |
| `representative_builds` | 同一エントリ1型、ポイント0..32かつ合計≤66、推定型にalgorithmVersion必須 |
| `ranking_publications` | 2形式のsnapshot IDは重複不可、形式・レギュレーション整合は公開関数で検証 |
| `active_publication` | `singleton_id=1`、その行のみ真の公開ポインタ |
| `ingest_runs` | 試行ごとに1行、`scheduled_for_jst UNIQUE`廃止、`(pipeline_id,started_at DESC)`インデックス |
| `update_poll_state` | pipeline単位1行、JST成功日付、pending状態、revision |
| `source_revision_state` | 形式ごとにetag/last_modified/revision。ソースが複数の場合はsource_idもキーに含める |
| `saved_calculations` | `(owner_id,updated_at DESC,id DESC)`安定ページング、revisionがUPDATE時に一度だけ増加 |
| `shared_calculations` | token_hash UNIQUE、失効/期限、元保存ID削除時`SET NULL` |
| `api_idempotency_keys` | `(owner_id,operation,idempotency_key)` UNIQUE、`expires_at`期限掃除 |
| `publish_rankings` | 管理ロールのみ、検証→単一transactionでpublication+active pointer+JST成功日を更新 |
| `read_active_rankings` | 同じ公開世代の2形式を同じ読取スナップショットで返す、一般ユーザーにraw統計全量を返さない |

制約のうちJSON構造/ID・世代相関/合法な性格ベクトルなど複雑なものは、APIバリデーションとDB-side constrained functionの両方で検証する。`jsonb`の型検証だけで済ませない。

## 3. 受け入れテスト定義

| ID | テスト | 必須期待結果 |
|---|---|---|
| DB-01 | snapshot 49件の公開 | 拒否・active pointer不変 |
| DB-02 | snapshotの順位欠番/重複 | 拒否 |
| DB-03 | シングルだけ更新成功 | 両形式の公開世代は不変 |
| DB-04 | 2形式とも50件＋検証済み | 一回のcommitでpointer切替 |
| DB-05 | 公開処理途中で障害 | rollback、前版利用可能 |
| DB-06 | 取得元の未承認版 | 本番公開不可・保留 |
| DB-07 | 同日の公開成功後、毎時Cron起動 | 外部問い合わせ0、`skipped_today`を記録 |
| DB-08 | 上流の新しい版を検知して15分 | 公開せずpending維持 |
| DB-09 | pendingが次時刻に再検出 | 最初の検知日時は変更されない |
| DB-10 | 上流の新しい版・30分経過 | 形式・ID等を検証後、公開可能 |
| DB-11 | 何日も上流更新なし | 日付変更で架空の更新成功を記録せず次回確認 |
| DB-12 | 1時間ジョブの二重起動 | 競合を抑止、重複公開なし |
| DB-13 | APIで性格等の統計を取り込む | observed/estimatedの区別が正しい |
| DB-14 | 不正なポイント、参照不明フォーム | 不正型の保存/公開を拒否 |
| DB-15 | 他ユーザーの保存取得 | RLS/APIとも拒否し存在も明かさない |
| DB-16 | revisionの競合 | 一方のみ成功、もう一方409 |
| DB-17 | 同一Idempotency Key同一入力 | 二重保存されず同一結果 |
| DB-18 | 同一Idempotency Key異なる入力 | 409 |
| DB-19 | 共有tokenが無効・失効 | 404または410、非公開行を露出しない |
| DB-20 | 共有の公開payload | owner/email/private情報を含まない |
| DB-21 | `anon`が内部統計へ直接書込 | GRANT/RLSで拒否 |
| DB-22 | `authenticated`が管理RPCを呼ぶ | 拒否 |
| DB-23 | 保存済みTOP50に別snapshotのoverride | 422拒否 |
| DB-24 | 過去マスター版が未配信 | `VERSION_INCOMPATIBLE`、最新への無断置換なし |
| DB-25 | 共有元の保存削除 | `source_calculation_id=NULL`になり共有の有効期限と無関係に自動失効しない（独立失効操作あり） |
| DB-26 | 元統計の保持期間終了 | 参照契約に応じて410や再現不能通知。勝手に現在版へ差替えない |
| DB-27 | `public`の初期GRANT監査 | 不要な操作権限なし |
| DB-28 | ビュー/RPCによるRLS迂回 | 非認可のユーザーが行を参照できない |

**重要**：ここに書かれた28件はテスト**仕様**であり、実DBで実行・成功したテストではない。実装工程で`supabase test db`等を使用し検証する。

## 4. API・UIとの整合チェック

1. `GET /api/v1/rankings/active`は`publicationId`とシングル・ダブル両方の`rankingSnapshotId`を返す。
2. 各行に`rankingEntryId`、順位、フォームID、`buildOrigin`、警告があり、UIの50行が復元できる。
3. TOP50の詳細内で変更した技・戦闘条件はDBへ永続化されず、詳細内の型変更のみ`defenderOverrides`へ保存可能。
4. TOP50の詳細から通常計算に遷移した場合、実際に転写された通常計算入力だけが保存・共有される。
5. ポケモン・特性・技の候補は版付きマスターが正本。ユーザーの未登録持ち物は表示用テキストとして保持しても、計算効果のある既知アイテムと同一視しない。
6. `payloadSchemaVersion`はnumber。`schemaVersion`の二重保存は禁止。
7. ダメージ乱数・HPバー・確定数の計算値はDBに保存しない。
8. 取得・生成・公開の時刻を異なる列として保持し、画面上で「最終確認日時」と「統計集計日時」を区別する。

## 5. Codexへ渡す際の実装順

1. **ゲート判断**：外部データの利用条件・順位表記・共有期限などの未承認仕様を、明示的に解決する。
2. 新規DB baselineスキーマと権限/RLSを生成。これまでのドラフトSQLは参考扱い。
3. DB制約、owner分離、管理関数公開制限のDBテストを先に書く。
4. マスター/外部ID正規化のAdapterとランキング取得・検証機能を実装。
5. 更新ジョブの状態機械、毎時確認、30分待機、二形式一括切替を実装。
6. 共有・保存・端末間同期のAPIとDBを接続。
7. UI v0.5を接続し、ランキング世代・詳細local状態・保存・共有のE2Eテストを実行。
8. `EXPLAIN`、ログ、エラーハンドリング、ライセンス順守、本番環境への移行を検証。

## 6. 成果物優先順位

正本：**本DB統合設計v1.2 → 更新ポリシーv1.2 → API設計v1.0 → フロント状態管理v1.0 → 旧DB v1.0/1.1**。旧ファイルに記載された`9:30固定`や「1日1回しか実行しない」という記述は本設計で廃止する。
