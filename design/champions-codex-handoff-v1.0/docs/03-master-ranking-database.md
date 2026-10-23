# 03 — マスター・TOP50・DB・更新運用

## マスターデータ P0-04

- 種族値、フォーム、技、特性、持ち物、習得技、性格／Stat Alignmentを、版付きの検証済みカタログに正規化する。**単一の完全正本APIは存在すると仮定しない**。
- 初期資料候補はCC BY 4.0を示す`otterlyclueless/pokemon-champions-data`。ただし旧作品由来の値が混じるためChampionsの収録判定を別途行う。PokéAPI、PokeDD、Championspedia、Showdown系は補助・照合候補で、権利と正確性を個別確認。
- **種族値とレベル50能力実数値を混同しない**。ランキングAPIのHP等に計算済み能力値が含まれる例がある。基本能力値の式を二重適用しない。
- 確定収録／未確認／未収録の区別、field provenance（各属性の出典・版・検証状況）を保持。原文説明・画像も利用条件を確認。
- 公開物に合法な技や特性を表示するときは実際のChampions収録確認が必要。既知技の習得外入力は計算用に受け付けるが、合法だと断定しない。

## TOP50 P0-05

- 第一候補：`Gheist23/pokemonbattledata`の形式別meta JSON。API由来の**`set`は上位要素の独立合成**のため必ず`estimated`（推定代表型）。結合分布の実測がある場合のみ`measured`。
- 別候補`eurekaffeine/pokemon-champions-scraper`: SinglesとDoublesでは集計元が違い、特にDoublesはShowdown/Pikalytics系のデータを含むため**ゲーム内TOP50と混同しない**。
- 過去照合で共通TOP50はシングル47、ダブル46、同順位は4/5だったが、観測期間・出所が違うためエラーの証明にはならない。
- 順位の完全一致の証拠は未取得。初回正式公開前にゲーム内画面と同一形式/シーズン/レギュレーションのTOP50×2を照合し、照合証跡を残す。差分あれば正式公開しない（内部プレビューに限り`未検証`と明示）。
- 使用率不明を0%と偽装しない。出典と`generatedAt`,`upstreamPublishedAt`,`firstSeenAt`,`fetchedAt`,`lastCheckedAt`を区別。元データが明示しない時刻は`null`。

## ランキング更新 v1.3 + v1.7 の統合

1. Supabase Cronを**毎時00分/JST**の意図で設定する（UTC基準なら`0 * * * *`、UTC毎時00分はJST毎時00分にも一致）。
2. `lastSuccessfulImportJstDate==currentJstDate`なら**外部アクセスせず即終了**。ジョブ起動そのものは毎時継続。
3. まだ成功していない場合、etag/Last-Modifiedやrevision/hash等で軽量変更検知。変更なしは次時刻。
4. 変更検知から**原則30分以上**、ソース公開時刻が信頼できればそれを基準、公開時刻が不明なら自アプリの`firstSeenAt`を基準に待機。途中でrevisionが変われば待機を再開始。
5. 同一比較可能性のあるシングルとダブルを取得しステージング。形式、各50件・1..50順位、重複なし、内部フォームID、代表型合計点、出典/レギュレーションを検証。
6. 検証に合格した両形式だけを1トランザクションで`ranking_publications`と`active_publication`へ登録・切替。同じトランザクションで成功JST日付を記録。
7. 失敗、データ遅延、出典未確認なら旧版維持し、次の毎時チェックへ。当日に旧版の同revisionを再取得しても「更新成功」と扱わない。

**留意**：30分後ちょうどに実行するのではなく、毎時のチェックにより公開から約30〜90分以降となる場合がある。単一の「公開版」へシングルとダブルが統計定義/時期を合わせられないときは公開を拒否。実データのrevisionが2形式で異なってもペア識別子と互換性で判断する。

## DBの統合論理構造（初期migrationで作る）

- `catalog_versions`, `pokemon_forms`, `moves`, `abilities`, `items`, `pokemon_abilities`, `pokemon_learnsets`, `regulations`、必要なデータ出典/field provenance
- `data_sources`, `source_pokemon_ids`, `source_approvals`, `ranking_snapshots`, `ranking_entries`, `usage_options`, `representative_builds`, `ranking_publications`, `active_publication`
- `update_poll_state`, `source_revision_state`, `ingest_runs`
- `saved_calculations`（auth.users所有、input JSONB、`revision`楽観ロック）、必要なら`api_idempotency_keys`（保存POSTのみ）
- **作らない**：`shared_calculations`, `share_tokens`, 公開リンク専用権限/履歴アーカイブ。旧`active_rankings`二系統ポインタと`ingest_runs.scheduled_for_jst UNIQUE`を使用しない。
- DBのチェック制約：rank一意、フォームID一意、能力ポイント範囲、参照の整合、RLS、service roleだけに公開切替権限。JSONのクロスフィールド条件はアプリ側/管理関数側も検証。
- TOP50のユーザー個人保存は参照ranking版が必要な間だけ閲覧可能。**旧データの無期限保持は禁止**。消えた場合は「旧版を復元できない」と表示し、明示的に現行TOP50で新セッションを作る操作を提供。

## 法務・帰属と公開条件

- データAPIはツール/Webアプリの利用を許すが、恒久ミラー・独立公開データサービスを回避。最新ランキングの合理的なキャッシュと、必要な内部処理に限定。
- 情報源の最新版規約を公開前に再点検。必要な帰属表示（例：Pokémon Champions Battle Dataへのリンク）と加工表示（CC BY 4.0の場合）を用意。
- API規約は公式キャラクター画像・商標の利用許諾を与えない。許諾がなければテキストや独自作成の代替表示を採用。
