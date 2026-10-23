# P0-04 マスターデータ取得元の採用方針 v1.0

2026-10-23 調査。**設計のみ。取り込み処理、データダンプ、マイグレーションの実装はしていない。**

## 1. 決定要旨

- **単一の絶対的な正本APIは現時点で決めない。** `catalog_versions`ごとに、ポケモン・フォーム、種族値、属性、技、特性、道具、習得技、性格/Stat Alignmentを検証して公開する「版付きキュレーション済みマスター」をアプリ内の正本とする。
- 初期取り込み候補は**CC BY 4.0の `otterlyclueless/pokemon-champions-data`**。再利用条件が公開されているため候補に適するが、2026-04頃の収録範囲（258フォーム、900技、583アイテム、191特性、258習得技）と、既存作品からの未検証データが混じるため「Champions現行マスターの完成版」と見なさない。
- **PokéAPI** は日本語名・一般的な図鑑情報等の補助。旧世代の習得技・技威力・持ち物をゲーム内の合法性判定へ自動流用しない。APIのfair-use上のキャッシュ義務を守る。
- **Pokémon Champions Battle Data** はランキングの既存メイン候補と同じ出典。公式公開APIには `GET /api/index`, `GET /api/pokemon/:name`, `GET /api/metadata/:name`, `GET /api/battle/:format/:name` があり、フォームの属性・能力値・特性の照合に使える。ただしメタデータの`hp/atk/…`を無条件に種族値として解釈しない。
- **PokeDD** のリポジトリはMITと明記。Champions対応差分や多言語名称の参照候補。ただしMITは独立第三者から入手した素材や統計データの権利までは保証しない。差分は原出典まで追う。
- **Championspedia** はゲームから取り出したと言明する396バトルフォーム・512合法技・215特性・166持ち物を公開（サイト表示時点v1.2.0）。第三者の参照・手動照合には有益だが、公開APIやデータの複製・再配布許諾を確認できないため、大量収集・コピーは設計上禁止。数字はサイトの主張であり実機監査未実施。
- **Pokémon Showdown** はオープンソースの技・タイプなど一般作の参考資料。MITソフトウェアライセンスはアート・ロゴ・ポケモン関連IPへの許可ではない。Champions専用の合法性は別検証。

## 2. 属性別の出典と優先順位

| 項目 | 初期候補 | 優先する確定条件 | 禁止される近道 |
|---|---|---|---|
| フォーム・参戦可否 | ゲーム内/公式レギュレーション証跡 + CC BYデータ | 形式/レギュレーション/ゲーム版とフォームIDを照合 | 種族単位で全フォルムを一括許可 |
| タイプ・種族値 | CC BY元データ + 検証済Champions差分 | **種族値であること**の確認、フォーム別完全6値 | APIの`hp/atk`を種族値と推測して加算 |
| 名称・日本語検索 | PokéAPI等の適法なローカライズ候補 | `pokemonFormId` / `moveId` 固定の別名辞書 | 表示名をDB主キーに使用 |
| 技（威力・分類・対象・追加効果） | CC BY元データ、Showdown一般データ | Championsで収録・当該技値/効果を確認 | 900技を全て学習候補にする |
| 特性・持ち物 | CC BY元データ + Champions照合 | 該当ゲーム版に実在し効果の正当性を確認 | 583持ち物を全て選択肢に表示 |
| 習得技 | CC BY元データ + Championsでの実測照合 | `(formId,moveId,regulationId,gameVersion)` 単位で合法 | 過去作のlearnsetをChampionsへ無条件適用 |
| 所持特性 | CC BY元データ + Championsでの実測照合 | フォーム固有の許容特性を確認 | 第三世代以降の特性枠をそのまま継承 |
| 性格/Stat Alignment | 25の合法な非HP補正ベクトル | Championsの呼称・設定方法を照合、U-01の倍率UI維持 | 0.9/1.0/1.1の不可能な独立組合せを保存 |
| 18タイプ相性 | Showdownの表 + Champions対照 | 表の全324組、無効/複合相性確認 | フォルム等による動的タイプ変化を表だけで処理 |
| TOP50代表型 | Battle Dataの使用率（別パイプライン） | 実測joint vs 推定independentの区別維持 | 人気技=確定で習得可能、と自動マスター更新 |

## 3. 対象外とUI表現

- 不明なマスターやソース未照合のフォームは、**選べても未確認と明示**するか候補一覧から除外する（検索の可用性 vs 正確性を分離）。TOP50に必要なフォームについては、ID未解決の場合に公開を中止する。
- 習得技候補はChampionsでの確認済み技を優先する。ユーザーが候補外の技を手入力する旧UI仕様は維持するが、その技の計算が可能でも「習得可能」とは表示しない。
- 追加効果の確率・技説明・アイテム説明は `fieldProvenance` を個別に保持する。旧作品の文章を無断転載せず、文言のライセンス/翻訳権利を確認する。
- 効果エンジンへの接続はカタログに含まれるだけでは不十分。`mechanicsSupport=verified|supported_unverified|unsupported` に応じた警告・計算停止を伴う。

## 4. マスター更新の独立性

- 最新TOP50を追う**毎時チェック・公開成功後は当日外部確認停止**のルールは、ランキングのパイプラインだけに適用。
- フォーム/技などのマスター更新は**ゲームパッチ発生・レギュレーション変更または明示的な出典改訂が確認されたとき**にステージングし、差分審査後に別の`catalogVersion`として公開する。毎時ランキングチェックと同時に全マスターを再取得しない。
- データ更新を検出しても無条件に公開しない。レギュレーション互換性、TOP50で参照されるID、技威力差分、属性差分を検証し、合格時のみ新カタログを公開。

## 5. 既存設計への適用

- 旧DB `pokemon_forms`,`moves`,`abilities`,`items`,`pokemon_learnsets`,`pokemon_abilities`,`catalog_versions`を基礎に、ソースと検証ステータスを属性単位で追える内部監査モデルを加える。ユーザーデータ`SavedInputSnapshot`では内部ID＋`catalogVersion`を記録。
- `pokemon_forms.baseStats`には本来の**種族値**のみ。Lv50/能力ポイント0などの実数値を格納しない。
- `moves.isAvailableInChampions`, `learnsets.isVerified` 等を単なるbooleanで完結させず `available|unavailable|unverified` / `verified|provisional|conflicting` の状態にする。
- 公開カタログに未確認の行を持たせる場合はUIと計算がその状態を解釈する。未検証を「実在する/使える」として扱わない。
- スプライト・アイテムアイコン・公式画像については**別のアセット権利監査**で決定する（今回決定していない）。

## 6. 出典

1. https://github.com/otterlyclueless/pokemon-champions-data および https://github.com/otterlyclueless/pokemon-champions-data/blob/main/LICENSE
2. https://github.com/otterlyclueless/pokemon-champions-data/releases
3. https://pokeapi.co/docs/v2 および https://github.com/PokeAPI/pokeapi/blob/master/LICENSE.md
4. https://github.com/Seancheey/PokeDD
5. https://thechampionspedia.com/about
6. https://championsbattledata.com/api_guide および https://championsbattledata.com/api-rules/
7. https://github.com/smogon/pokemon-showdown
