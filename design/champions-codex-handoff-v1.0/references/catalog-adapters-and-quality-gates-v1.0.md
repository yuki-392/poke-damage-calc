# 正規化・フィールド契約・品質ゲート v1.0

## 1. 取得・公開の段階

```
利用規約が確認されたソース → SOURCE_STAGING（元の版・日時・根拠を記録）
  → 同定（ID/フォーム/レギュレーション）
  → 正規化（型・単位・能力の意味）
  → 属性別出典証明（fieldProvenance）
  → ゲーム版・技/特性/道具の合法性照合
  → effectカタログの支持状態を確認
  → 品質ゲートに合格 → catalog_versions に不変版を発行
  → bootstrapで有効なcatalogVersionを配信
```

ゲームパッチ・レギュレーション変更とランキング毎時更新は別ジョブ。カタログ公開時に旧版を上書きしない。公開済みバージョンの意味は不変。保存済み計算が旧catalogVersionを参照し、旧版保持ができない場合は明示エラーを返す（過去の外部ランキング生データを永久保存する義務は設けない）。

## 2. 共通識別子

- 主キー `pokemonFormId`: 文字列。表示名・図鑑番号だけで同定不可。メガ・リージョン・フォルム・雌雄差等を区別する。
- `speciesId` と `pokemonFormId` を分離。ランキング用 `source_pokemon_ids` はソースID、名前空間、外部ID、内部フォームID、承認根拠を持つ。
- `moveId`、`abilityId`、`itemId`はロケールに依存しない安定ID。日本語・英語などの表示名はバージョン付き辞書。
- `regulationId`, `gameVersion`, `catalogVersion`, `mechanicsVersion`を区別。
- `availabilityStatus`は `available|unavailable|unverified`、`verificationStatus`は `verified|provisional|conflicting`、効果側の実装状態は `verified|supported_unverified|unsupported` を採用。

## 3. 重大なフィールド意味問題：能力値

Battle Data API Guide にある `GET /api/metadata/tauros` の通常ケンタロス例は次の数値を返す：

```
hp=150, atk=120, def=115, spa=60, spd=90, spe=130, total=665
```

一般に知られる種族値は `75,100,95,40,70,110`（合計490）。APIの例は `HP=種族値+75`、その他 `種族値+20`、合計 `490+75+20*5=665` に一致する。

**設計結論：これらを `baseStats` に入力してはいけない。** この例はChampionsの能力ポイント0・性格無補正時の計算済み能力値と整合するが、実際のAPIの全レコードが同一規約であることは未確認。機械的に `-75/-20` して補正するルールも無条件には採用しない。まず独立した種族値データと数十フォームで照合し、フィールドの意味が同じと検証されたソース／版／フォームのみ変換許可する。

内部の型は `BaseStats` と `DisplayedStats` を明示的に分け、異なるタグ（`statKind`）を持たせる。公開マスターの`baseStats`がレベル50実数値を受け付ける変換を禁止する。

## 4. フォーム・技などの照合条件

### フォーム
- `formId`の一致は外部ID / 全国図鑑番号 / リージョン / 特定フォーム / megaなど複数条件を使用。
- 明示的な衝突は`conflicting`、ランキングTOP50のフォーム解決に失敗したら当該ランキングpublicationの自動公開停止。
- 参戦可否は`(pokemonFormId,regulationId,gameVersion)`で判定。

### 技
- 一般作品の技データに存在してもChampionsに実装済みと確定しない。
- `type`, `category`, `power`, `accuracy`, `priority`, `target`, `minHits/maxHits`, `effectKey`, `secondaryEffectChance`をフィールド別に検証。
- 威力が可変なら `basePower=null`, `effectKey=...`, `contextRequirements` のように分ける。未知を威力0や通常威力100で代替しない。
- 習得可能性は`pokemon_learnsets`を `(formId,moveId,regulationId,gameVersion)`単位で保持。検索入力できることと合法な習得とは別。

### 特性・道具
- `pokemon_abilities`は検証済みのフォーム所有特性のみを選択候補とする。
- `items`はChampions版での収録・効果を独立検証。未収録の旧作品アイテムを自動で有効にしない。
- 特性・持ち物の「所持可能」かつ「計算エンジンが効果対応済み」を分け、前者だけで計算成功と見なさない。

### 性格／Stat Alignment
- U-01（0.9/1.0/1.1倍率UI、内部では合法な単一の補正ベクトル）の体験を維持。
- Championsでの公式表記としてStat Alignmentが使われる資料があるため、英語の従来Nature名を内部の同一性と決めつけない。`alignmentId`と別名・5能力補正ベクトルのマッピングを検証。フォームの性格表示と統計由来`nature`を混同しない。

## 5. カタログ公開ゲート

`READY`になるには最低限次を満たす：
1. 使用ソース各々について実際のデータ用途と帰属表示が確認されている。
2. 公開対象フォームがstable IDで一意に識別できる。少なくともTOP50×2形式の全参照フォームを解決できる。
3. 公開されるbaseStatsは種族値であることが検証済み。6項目・型・範囲を満たす。
4. `available`と表示する技/道具/特性/習得技はChampions収録根拠が記録されている。
5. ID参照の欠落、孤児レコード、不可能なalignment補正、属性値の衝突がない。
6. 入力データとの差分と `contentHash`、元ソースの `revision`、`verifiedAt` が追跡できる。
7. 古い選択条件を黙って新versionに移さず、失効・不整合時に利用者へ知らせる経路がある。
8. 引用・出典・画像権利の審査を通過している。

未収録/未検証のマスターがある場合、全カタログを必ずしも止めるのではなく、`unverified`を明示し、少なくともTOP50の機能と対象データの正確性ゲートは必ず厳しくする。

## 6. source freshness/versions

- `sourceRevision`=取得元のコミットSHA/ETag等、`sourceGeneratedAt`=元で生成、`sourcePublishedAt`=元の公開、`fetchedAt`=当アプリが取得、`verifiedAt`=照合完了、`catalogPublishedAt`=内部正本として公開。時刻は混同しない。
- タイムゾーンはAPI上UTC ISO 8601で保持、日付表示はJST変換。
- 統計APIからの代表型は種族値マスターではない。`sourceRevision`一致だけでも種族値/技の正しさは保証されない。
- データ更新成功を「外部取得した」ではなく「整合性を検証し公開した」と定義する。
