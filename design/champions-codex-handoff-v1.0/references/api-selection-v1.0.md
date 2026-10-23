# Pokémon Champions ダメージ計算アプリ — API選定記録 v1.0

- 決定日: 2026-10-23
- 状態: **第一候補を決定／本番採用はライブデータ検証条件付き**
- 対象: TOP50使用率、性格・能力ポイント・特性・持ち物の採用統計

## 結論

**主データソース:** Pokémon Champions Battle Data API（https://championsbattledata.com/api_guide）

**補助候補:** Pokémon Champions Battle Meta API（https://eurekaffeine.github.io/pokemon-champions-scraper/）

主データソースを可能な限り統一する。主データソースにランキングの必要な順位が存在しない場合、順位の定義を変更して補完することはせず、ユーザーの「ゲーム内バトルデータTOP50」という要求との整合性を改めて判定する。

## 選定理由と確認状況

| 要件 | Battle Data API | Battle Meta API |
|---|---|---|
| Singles・Doubles両形式 | 公開仕様で対応 | 公開仕様で対応 |
| 統計（性格・能力ポイント・特性・持ち物） | ポケモン別のバトルデータ取得APIが公開 | JSONの種別によって掲載範囲が異なる |
| ゲーム内ランキングとの一致 | ランキングページ・内部メタファイルの存在を確認、順位の全件JSON取得は未検証 | Singlesはゲーム内取得元、DoublesはShowdown/Pikalytics由来で要求と異なる |
| 取得頻度 | 現在データと日付別データの設計を公開 | 毎日2:00 UTC（日本時間11:00）更新と案内 |
| 公開利用条件 | 公開規約あり。出典表示必須、適切なキャッシュ可。単独のデータ再配布不可 | ソースサイトの利用条件を別途確認すること |

**注意:** 候補URL・仕様書の存在は確認したが、現時点では実データ全件のネットワーク取得、データ検査、ゲーム内順位との一致照合は未完了。公開仕様に基づく選定であり、本番稼働を保証するものではない。

## データの取得元と予定エンドポイント

### 主API

- `GET https://championsbattledata.com/api` — ポケモン索引、関連メタデータ
- `GET https://championsbattledata.com/api/battle/Singles/{showdownId}` — シングルの技・持ち物・性格・能力ポイント等の行
- `GET https://championsbattledata.com/api/battle/Doubles/{showdownId}` — ダブルの同種の行
- `GET https://championsbattledata.com/api/metadata/{baseName}` — フォルム別マスターデータ
- **順位JSONの検証候補（公開リポジトリに生成物の説明あり、アクセス未検証）**：`/data/builder/meta-singles.json`、`/data/builder/meta-doubles.json`

### 補助API

- `GET https://eurekaffeine.github.io/pokemon-champions-scraper/singles/battle_meta.json`
- `GET https://eurekaffeine.github.io/pokemon-champions-scraper/battle_meta.json`

補助APIのDoubles順位はゲーム内ランキングと同義として使用しない。異なる指標を採用する必要がある場合は、別表示・明示的な仕様変更を要する。

## 推定代表型の作成

1. 実測の完全な型の統計が得られれば **実測代表型** を採用。
2. 完全な型を得られない場合、項目別統計から能力ポイント配分・性格補正・特性・持ち物を整合的に組み合わせ **推定代表型** と表示。
3. 異なる提供元・シーズンのデータを混在させる場合は、その出所と時点を記録し、可能なら同一時点の統計を優先。
4. 不足データに対して推測した採用率や確度を表示しない。

## 本番採用の検証ゲート

- [ ] 実URLでHTTP成功とJSON構造を確認（複数回）
- [ ] Singles／Doubles両方で順位1〜50を欠損・重複なく取得できる
- [ ] TOP50順位がゲーム内バトルデータベースの対象レギュレーションと一致する
- [ ] フォルムと内部IDをアプリのマスターデータに一意対応できる
- [ ] 能力ポイント配分・性格・特性・持ち物の統計項目を実際に取得できる
- [ ] 出典、統計の集計日、取得日時を別々に保持できる
- [ ] 利用条件・キャッシュ期間・アクセス負荷を運用設計として確認する

検証ゲート未通過の場合は「API採用確定・連携完成」と扱わず、データベースのデータ取得層を交換可能に保つ。

## 更新処理

- 09:30 Asia/Tokyo に一度だけ更新試行する。
- 正常な50件および関連する代表型データの検証に成功してから、公開スナップショットを切り替える。
- 取得元の統計が未更新なら旧スナップショットを維持する。
- 失敗時の自動再試行は行わず、旧正常データと更新失敗表示を維持する。
- `fetched_at` と `source_data_at` を区別する。09:30の取得が「当日集計」である保証はしない。

## 実装上のインターフェース案

```ts
interface RankingSource {
  fetchTop50(format: 'singles' | 'doubles'): Promise<RankingSnapshot>;
}

interface UsageStatsSource {
  fetchPokemonStats(pokemonId: string, format: 'singles' | 'doubles'): Promise<PokemonUsageStats>;
}
```

各レスポンスは内部形式に正規化し、外部API固有のフィールド名を計算エンジンやUIに直接持ち込まない。

## 参照

- https://championsbattledata.com/api_guide
- https://championsbattledata.com/api-rules/
- https://github.com/Gheist23/pokemonbattledata
- https://eurekaffeine.github.io/pokemon-champions-scraper/
- https://github.com/eurekaffeine/pokemon-champions-scraper
