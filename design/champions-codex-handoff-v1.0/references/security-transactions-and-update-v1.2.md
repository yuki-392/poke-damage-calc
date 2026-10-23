# DB権限・トランザクション・定期更新 設計 v1.2

> 設計のみ。SQL/RPC/Edge Function等は未デプロイ。正式実装前にSupabaseの現行仕様を再確認する。

## 1. スキーマ境界と権限マトリクス

| 対象 | `anon` | `authenticated` | 内部更新ジョブ | 公開経路 |
|---|---|---|---|---|
| マスター、規定 | 許可された読取のみ | 同 | 管理 | 版付き静的アセットと読取専用API |
| ランキング、統計、代表型の内部行 | 直接不可 | 直接不可 | 専用管理権限で書込 | Next.jsが集約DTOを返す |
| `update_poll_state`, `source_revision_state`, `ingest_runs` | 不可 | 不可 | 専用管理権限 | 更新日時・出典など限定メタ情報 |
| `source_approvals`, 発行関数, 公開ポインタ | 不可 | 不可 | 承認済み内部ロールのみ | 公開ランキング取得のみ |
| `saved_calculations` | 不可 | 自身の行のみCRUD | 原則不要 | 認証済みAPI |
| `shared_calculations` | 直接不可 | 直接一覧アクセス不可（本人の管理もAPI経由） | 保存・共有管理サーバー | ハッシュ照合の専用Route |
| `api_idempotency_keys` | 不可 | 直接不可 | 信頼済みサーバーで限定CRUD | 公開しない |

- RLSポリシーだけでなく`GRANT`を操作別に限定する。既存`public`スキーマの既定権限を必ず監査。
- 内部更新テーブル・秘密のtoken/replay payloadは可能なら**非公開スキーマ**に置く。Supabase Data APIに公開されるスキーマの`SECURITY DEFINER`関数を公開しない。
- 管理用キーやserviceロールはブラウザへ配布しない。専用ジョブの認証を必要とし、内部ジョブにも過剰権限を配布しない。
- private shared inputを安易にUI側DBクライアントから取得しない。サーバーでtokenハッシュ、失効・期限、版有効性を確認して最小化DTOを返す。
- 認証ユーザーの`owner_id`はサーバー/JWTの認証情報から導出し、リクエストの値は信じない。
- ビューの公開権限と`security_invoker`設定、関数の固定`search_path`、RLSバイパス経路まで含めて監査する。
- 共有リンクのtokenをHTTPアクセスログ、エラーログ、第三者アクセス解析、referrerへ送らない。共有ページはnoindex・no-store・no-referrer。

Supabase公式参考：
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/cron
- https://supabase.com/docs/guides/functions/schedule-functions

## 2. 更新ジョブ：v1.2の決定をDBへ反映

### スケジュール・停止条件

- Supabase Cronは毎時00分にジョブを起動（`0 * * * *`）。JST日付の判定は `timezone('Asia/Tokyo', clock_timestamp())::date` 相当で行う。SQLサーバーのタイムゾーン設定に暗黙依存しない。
- **当日JSTに新しい版の取込・公開を完了**した場合、DBの状態確認のみで終了し、外部API通信ゼロ。
- 当日未成功で上流に変更がなければ1時間後に再チェックし、旧公開版を維持。上流の変更がない日に同じ版を再公開して成功扱いしない。
- 新しい版を検知して公開時刻が信頼できる場合は、その時刻から30分以上経過した後に検証。公開時刻が不明なら「初回検知」から30分以上経過した後。30分は鮮度調整の待機時間であり、厳密な公開時刻の保証ではない。
- 条件付きHTTP検査で`ETag`/`If-None-Match`を優先。ソースが対応しなければGitHubのblob SHA等の軽量識別子を取得し、不要なJSON全文転送を抑える。
- シングルとダブルの**両方のsource revisionと版整合**を検証し、片方だけの新しいデータを公開しない。upstreamが同コミット・同時更新とは限らないため、差異があればpending待ち/警告を記録。

### 疑似状態遷移

```text
Cron起動
  → 排他ロックを試みる（取得できないならbusyで終了）
  → 本日既に新revision公開成功？ yes → skipped_today・外部通信0
  → 形式別の軽量識別子を確認、source_revision_state更新
  → 不変なら unchanged。来時刻へ
  → 新しいpair_revisionなら pending_source_revision/pending_first_seen_atを保存
  → 30分未満なら pending_delay。来時刻へ
  → 二形式のJSONを取得・正規化（承認された利用範囲内）
  → 出典、レギュレーション、全rank 1..50、ID/フォーム、能力ポイント等を検証
  → 公開ゲート未充足なら awaiting_verification。旧版維持
  → DBトランザクションで2 snapshots+publication+active pointer+成功日付をコミット
  → 成功後はそのJST日の外部問い合わせをスキップ
```

### 競合・失敗への安全策

- 同時実行は`pg_try_advisory_lock`やジョブの一意なleaseを用いて制御。実行ジョブ履歴は`ingest_runs`に毎回追加し、唯一の公開ポインタが競合しないようトランザクションを限定。
- 長い外部HTTP取得中にDBトランザクションを保持しない。stageへ保存して検証してから短いpublication transactionを開始する。
- プロセスが途中終了しても`pending`を再開できるよう、更新識別子・first_seenを持続化。次回にpendingが残っている場合、**一度検知した同じリビジョンを新リビジョン扱いにして30分待ちをリセットしない**。
- 2形式の検証・公開が完了しない場合は成功フラグを立てない。
- 管理者がロールバックする場合も`ranking_publications`は消去せず、active pointerを以前の正当な公開版へ戻し、操作記録を残す。元統計の保持ルールに適合する期間内だけ。
- ログにAPIキー、共有token、プレイヤーの入力payload、ユーザーメール等を含めない。

## 3. 保存と共有：トランザクション契約

### 保存の楽観ロック

`PUT /api/v1/calculations/{id}`は`If-Match: "rev:n"`を必須とし、`owner_id`+`id`+`revision`一致で更新。DBトリガーが新revisionを一度だけ付与する。更新ゼロ行なら404（存在を明かさない）または409（本人の競合）で応答。自動マージ不可。ログイン端末ごとに最新の編集データへ無断上書きしない。

### 保存作成/共有作成の冪等性

- `POST /api/v1/calculations`、`POST /api/v1/shares`にはUUID形式の`Idempotency-Key`を受け取る。
- 同じ所有者・operation・keyと同一ボディハッシュなら同じ結果、異なるボディなら409。
- `api_idempotency_keys`の保存期限を切り、失効したキーの再利用方針は`IDEMPOTENCY_EXPIRED`等の明示応答を仕様化する。保持期限の具体値はセキュリティ設計確定時に定める。
- 共有作成レスポンスにある平文tokenの繰り返し返却が必要なら、短期暗号化レスポンスとしてのみ保管。漏洩リスクがある場合は冪等な共有作成自体を再検討する。

### 保存/共有の入力検証

1. Zod等でJSON構造検証（型、サイズ、schema version）。
2. 登録済みの`pokemonFormId`と規定・マスターの対応検証。
3. 各能力ポイント0〜32、合計≤66、性格補正の合法性、能力ランク範囲。
4. TOP50の場合は`rankingSnapshotId`に属する`rankingEntryId`のみをoverrideとして許可。
5. 詳細ローカルの技・戦闘条件、ダメージ乱数・表示値は入力に混入させない。
6. マスターにない持ち物自由入力は保存可能。ただし計算は`unsupported`として扱い、存在する効果を捏造しない。
7. 版と利用許諾の関係から過去の再計算が保証できない時は`VERSION_INCOMPATIBLE`や`SNAPSHOT_EXPIRED`を返し、無言で新しいランキングへ差替えない。

## 4. 品質・運用監視

- 更新監視：最終外部確認、最後の新revision検知日時、最後の公開成功、連続失敗数、最新公開snapshotの年齢、両形式50件。外部APIの到達性と利用条件違反の監視。
- セキュリティ監視：RLS拒否、保存競合、共有無効token試行、認証異常、過大JSON送信。共有tokenはログから削除。
- 手動運用：公開ソース承認/撤回、旧publication復帰、保留中revisionの破棄、マスターID対応の修正を管理操作で実施。
