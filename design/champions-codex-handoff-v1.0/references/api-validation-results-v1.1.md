# TOP50公開JSON検証結果 v1.1

検証日: **2026-10-23** / 検証対象: UI v0.5、要件定義 v0.3、DB v1.0

## 検証方法と限界

公開GitHubリポジトリの実ファイル内容を取得してJSONパース、各形式のレコード数・1〜50位の順位連続性・重複・代表型の能力ポイント配分を確認した。取得したファイルのGit blob SHAを以下に記録する。

**成功したこと:** GitHubに公開された4つのデータファイルの実データ構造検証。

**未実施:** `championsbattledata.com/api/*`の本番ドメインへのHTTPアクセス（当該URLへの直接アクセスが検証環境で不可）。JSONとゲーム内バトルデータベース画面の順位照合。2026-10-23 09:30 JST時点の新規統計取得の保証。ポケモンの全フォルムのマスターデータ対応。実SupabaseへのSQL適用。

検証済みの静的JSONと、ライブAPIの稼働確認は別の検証項目として扱う。

## 実データ結果

| ソース / 形式 | データ日時(UTC) | 総件数 | 先頭50件 | 順位連番 | 名前ベースの先頭50重複 | 備考 |
|---|---|---:|---|---|---|---|
| Battle Data Singles | 2026-10-22 08:44:17 | 262 | OK | OK | 無 | 推定セット50件分を確認 |
| Battle Data Doubles | 2026-10-22 08:44:17 | 262 | OK | OK | 無 | 推定セット50件分を確認 |
| Battle Meta Singles | 2026-10-22 07:53:43 | 257 | OK | OK | 無 | usage_rate=0は使用率不明 |
| Battle Meta Doubles | 2026-10-22 07:02:31 | 289 | OK | OK | 無 | Pikalytics由来 |

Battle Data両形式の先頭50件について、`set.nature` / `set.ability` / `set.item` / `set.bonuses[6]`、および`natures` / `abilities` / `items` / `spreads`の存在を確認した。`set.bonuses`は各0〜32かつ合計66以下の100件すべてで整合。

**Git blob SHA**

- Main Singles `884bae8e23b1b8f1e279f8424a4c515cf3d81a38`
- Main Doubles `fed8d3521a8d82bce39b0156a50d76fa54a9485f`
- Alternative Singles `00be6eb6c7b814b91aacfb6ab9d72dabdcc8fec1`
- Alternative Doubles `bd037d14ab9dc7b42a2b449f1f58f03b0d553998`

### JSONのスキーマ

**Battle Data `data/builder/meta-*.json`:** トップレベルは`generatedAt`, `format`, `pokemon`。`pokemon[]`は`position`, `name`, `species`, `form`, `set`, `moves`, `items`, `abilities`, `natures`, `spreads`等を持つ。`set.bonuses`はHP・攻撃・防御・特攻・特防・素早さ順に6要素。

**Battle Meta `battle_meta.json`:** トップレベルは`updated_at`, `season`, `pokemon_usage`等。`pokemon_usage[]`は`rank`, `dex_id`, `name`, `form`, `usage_rate`等。**Dex IDだけではフォルムを一意に識別できない場合がある**ため、マッピング検証は別途必要。

### 代表型の重要な発見

Battle Dataの提供元`tools/builder-meta.mjs`には、`set`が`move`・`held_item`・`ability`・`stat_alignment`・`stat_points`の各カテゴリの上位行から合成されると明記されている。したがって、トップ50すべてに`set`が存在していても**「最多採用の完全な組み合わせ」の実測ではない**。

アプリ内では**推定代表型**として表示し、`build_kind='estimated'`, `algorithm_version`, 各項目の出典を保持する。`observed`としない。

### 取得元ごとの差異（単純な英名比較）

| 比較 | 先頭50に共通する名前 | 同じ順位の名前 |
|---|---:|---:|
| Singles | 47 | 4 |
| Doubles | 46 | 5 |

例えばSinglesの上位3件は、Battle Dataで `Garchomp, Primarina, Mimikyu`、Battle Metaで `Garchomp, Salamence, Primarina`。Doublesはそれぞれ `Garchomp, Sneasler, Rillaboom` と `Rillaboom, Sneasler, Incineroar`。

この比較は名称ベースであり、フォルムや集計期間を揃えた正式な一致率ではない。**統計出所や時点が異なるため、行を混ぜて単一の公式TOP50として扱わないこと。**

## 採用判断

- **第1候補として採用継続:** Battle Dataの生成済み `data/builder/meta-singles.json` と `meta-doubles.json`。順位と推定用統計をまとめて取得できる点で実装に有利。
- **技術上の暫定採用:** 上記JSONをアダプターで内部形式に正規化する。配信時のHTTP、更新時刻、ライセンスが利用形態を満たすかを本番化前に確認する。
- **公式順位としての採用保留:** 本体のゲーム内バトルデータ順位との照合完了まで `rank_verification='unverified'` にする。ゲーム内と一致しなければデータソースの再選定が必要。
- **Battle Metaは照合用途:** SinglesはMunchStats画面取得由来、DoublesはPikalytics由来の異なる集計。Doublesをゲーム内順位の代替として無断採用しない。

## 次の受け入れゲート

- [x] 4種類の公開JSONを取得・パース可能
- [x] 先頭50件の連番と重複を検証
- [x] メインデータ100件の代表型構造・能力ポイントを検証
- [x] `set`が推定型であることをソース生成コードで確認
- [ ] ゲーム内順位に対しSingles/Doubles各50件の順位一致を確認
- [ ] フォルムIDの100件のマッピング検証
- [ ] 本番の静的配信エンドポイントのHTTP安定性と更新履歴を連日確認
- [ ] 9:30 JSTの出典更新タイミングを確認
- [ ] 利用規約・キャッシュ範囲を実装形態に合わせて確認

## 根拠URL

- Main Singles: https://github.com/Gheist23/pokemonbattledata/blob/main/data/builder/meta-singles.json
- Main Doubles: https://github.com/Gheist23/pokemonbattledata/blob/main/data/builder/meta-doubles.json
- Main set generator: https://github.com/Gheist23/pokemonbattledata/blob/main/tools/builder-meta.mjs
- Main API rules: https://championsbattledata.com/api-rules/
- Alternative Singles: https://eurekaffeine.github.io/pokemon-champions-scraper/singles/battle_meta.json
- Alternative Doubles: https://eurekaffeine.github.io/pokemon-champions-scraper/battle_meta.json
- Alternative data origin: https://github.com/eurekaffeine/pokemon-champions-scraper
