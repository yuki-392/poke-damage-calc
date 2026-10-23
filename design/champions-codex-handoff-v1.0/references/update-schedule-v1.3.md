# 更新・取り込み契約 v1.3 — 確定仕様の統合

日付: 2026-10-23 / status: **accepted per user** / 対象: API, ADR, architecture, DB, frontend, tests

## 現行仕様（唯一の更新スケジュール正本）

1. Supabase Cron を **毎時00分**、`0 * * * *` で起動。Asia/Tokyoの日付で更新成功日を判定する。Cron内部の時刻解釈・インスタンス設定はデプロイ時に確認する。
2. 最初に DB の `update_poll_state.last_successful_import_jst_date` を参照し、同日なら**外部通信を一切せず** `skipped_today` で終了する。Cron自体は毎時起動する。
3. 未成功なら `ETag`/`If-None-Match`、Last-Modified、又はGitHub commit/revision などを使って**軽量に変更検知**。複数ファイルの更新世代が一致するか確認。変更がなければ終了。
4. 新しいrevisionの上流公開時刻が信頼して取得できる場合はその時刻から **30分以上**。公開時刻不明の場合は当該revisionの `pending_first_seen_at` から **30分以上**。この場合「実際の公開の30分後」とは言わない。待機中のrevision変更は起点をリセット。
5. 待機後シングル・ダブルを取得・検証し、同一ソース世代・レギュレーションと各50件、代表型合法性を検証。内部承認・外部データ公開可否ゲートも満たしたときだけ一括公開する。
6. **新しい版を実際に一括公開できた時だけ** `last_successful_import_jst_date` を現在のJST日付に記録。単なる200/304、更新なし、片方の取得成功、失敗は成功扱いしない。
7. DB公開・成功日記録は一つのトランザクション。失敗ならロールバックして旧publicationを継続利用。ロック・冪等化で二重実行を防ぐ。
8. 同日再修正が発生しても、最初の公開成功後は翌日まで確認しない（ユーザーが了承したトレードオフ）。

## canonical fields

`lastCheckedAt`, `lastSuccessfulImportAt`, `lastSuccessfulImportJstDate`, `activeSourceRevision`, `pendingSourceRevision`, `pendingFirstSeenAt`, `pendingUpstreamPublishedAt`, `sourceGeneratedAt`, `importedAt`, `publicationPublishedAt`。`sourceGeneratedAt` と公開/取得日時は異なる。

## 旧設計からの廃止

- `30 0 * * *`（9:30 JST 1回）のCron / 成功後も当日確認する方式 / 自動再試行なし
- `ingest_runs.scheduled_for_jst date UNIQUE`（毎時の記録を妨げる）
- `active_rankings` のsingles/doubles別々の公開ポインタ
- 「APIの更新時刻は9:00だから9:30取得」など根拠のない固定時刻

*Supabase Cronのジョブ作成、Edge Functionのスケジュール呼び出し、Vault秘密情報の管理は公式ドキュメントに従う。*
- https://supabase.com/docs/guides/cron
- https://supabase.com/docs/guides/functions/schedule-functions

## 必須受け入れテスト

- 当日公開済みなら **外部HTTP 0回**。
- 未成功で304/不変なら JSON本体再取得なし。成功日をセットしない。
- firstSeenが10:00なら10:00および10:29では取り込まず、10:30以降のCronで候補となる。
- pending revisionが変われば30分時計をリセット。
- シングル成功/ダブル失敗で旧publication維持。
- トランザクションで公開時だけ成功JST日が記録される。
- 複数日更新がないときは、初回変化後に同じフローで再開。
