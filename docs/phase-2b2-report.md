# Phase 2-B 第2段階: 実名5技のモデル登録と限定L2検証

2026-10-24（JST）。指定5技の候補モデル登録と検査を実施した。**今回の限定実装は実施済み。Phase 2-B全体・Phase 2全体は未完了、ゲーム本体との一致は未検証。** Phase 2-Aと2-B第1段階のユーザー確認済み完了状態を維持する。

## 根拠と収録状態

既存の統合設計 `docs/04-damage-engine.md` を優先し、詳細設計/効果一覧の範囲技・しおふき・変化技の扱いを確認した。参照版は **@smogon/calc 0.12.0**、gitHead `d7a69cf40616057ef40faf7623df7a628e58b535`。インストール済みソース/JSとgeneration 0の実APIで確認した。今回のL2では実名Moveを使用し、参照技の威力・タイプ・分類・targetを上書きしていない。

- [Champions技リスト/パッチ/継承データ](https://github.com/smogon/damage-calc/blob/d7a69cf40616057ef40faf7623df7a628e58b535/calc/src/data/moves.ts#L4938-L5501): 指定5技がCHAMPIONS_LISTに存在し、SVの基礎データとChampions差分を合成する。
- [Champions専用計算](https://github.com/smogon/damage-calc/blob/d7a69cf40616057ef40faf7623df7a628e58b535/calc/src/mechanics/champions.ts): Statusは早期終了。Water SpoutはHP比による威力をfloorして最低1。範囲補正はDoublesかつ該当target。Technicianは動的威力決定後のBPに閾値を適用。
- [Moveコンストラクタ](https://github.com/smogon/damage-calc/blob/d7a69cf40616057ef40faf7623df7a628e58b535/calc/src/move.ts): 明示targetがない場合のAPI既定値はany。

これは **reference_listed / supported_unverified** の候補であり、実ゲームの版/レギュレーション/全フォームの使用可能性や習得合法性を確定していない。Phase 1の未確認マスターを補完・confirmedへ昇格していない。登録テストはsyntheticフォーム/習得技のfixtureだけで行った。ゲーム由来の説明文や画像は転載せず、数値・属性を自作契約へ正規化した。出典/固定リビジョン/確認日を効果定義へ保存し、MIT表示はTHIRD_PARTY_NOTICES.mdに保持。

## 技ごとの登録状態

| 技 | 候補モデル | 対象範囲/今回の扱い | L2実行ケース数 |
|---|---|---|---:|
| じしん | standard / 威力100 / ground / physical | allAdjacent。自己以外の隣接対象、味方を含む。実命中1体は範囲補正なし、2〜3体はF1=3072/4096 | 8 |
| いわなだれ | standard / 威力75 / rock / physical | allAdjacentFoes。1体補正なし、2体は範囲補正。3体指定はinvalid | 6 |
| かえんほうしゃ | standard / 威力90 / fire / special | 1体への通常ダメージ。参照targetはany。2体以上の指定はinvalid | 7 |
| しおふき | hpScaled / 基準威力150 / water / special | allAdjacentFoes。HPから威力決定後にP1/A1/F1〜F4を適用。1体と2体の範囲補正を分離。3体指定はinvalid | 11 |
| まもる | nonDamaging | 変化技。rolls/range/KO/分布を返さない。防御・行動順・対象位置の戦闘処理は実装しない | 3（分類比較） |

参照APIのProtectはpower0 / Normal / Status / priority4 / target anyだが、anyはコンストラクタの既定値であり「相手を対象とする技」という根拠にしない。登録のreference欄にはAPI観測値をそのまま保存し、実行モデルはnonDamagingのみ。かえんほうしゃについても、選択対象の位置・射程のシミュレーターを実装したわけではない。

いわなだれのひるみ、かえんほうしゃのやけど、命中率・行動選択は対象外。計算結果には命中した同条件の独立試行と、追加効果をシミュレートしない前提を付ける。

## エンジンとDTOへの変更

- 新規 `champions-moves.ts` に指定5件だけを登録。既存EngineCatalog.movesとeffectIdsを利用し、`championsMove`効果variantに名称と証跡を保持。
- 指定モデルと登録効果が矛盾すれば `unsupported / MOVE_MODEL_MISMATCH`。効果種別を技以外へ結合する場合や重複モデルも停止。出典の収録状態がunconfirmedなら `NAMED_MOVE_AVAILABILITY_UNCONFIRMED`。
- 正準モデルはfreezeし、外部からの定義変更で既存エンジンのモデル照合が変わらないようにした。カタログは既存どおりfactoryで検証/複製。
- M0のHP連動威力解決を名前付き条件判定の前へ移動。しおふきの登録が検証された場合に限り、既存3実名効果との組合せを許可した。未知のHP連動技を一括して対応済みにしない。
- しおふきの威力は `max(1, floor(150 * currentHp / maximumHp))`。最大HPはフォームの能力モデル/種族値/能力ポイントから導出し、175等の定数を埋め込まない。現在HP欠損は `missingContext / CURRENT_HP_REQUIRED`。最大HPの導出に必要な種族値欠損は `missingContext / MAX_HP_UNAVAILABLE`。0・負・小数・最大HP超過はinvalid。
- テクニシャンはM0後・てだすけ等のP1乗算前の威力60以下で発動。HP71/175→威力60では発動、HP72/175→61では非発動。いのちのたまは既存のF4、ちからもちは物理分類だけのA1。しおふきのちからもちは非発動。
- 保存DTO/Phase 1契約/OpenAPIは変更していない。補助条件は既存の3効果のactive/suppressedのみ。未知効果や未対応条件を中立倍率にしない。
- 通常/TOP50は同じcalculateDamageを使用。じしん/かえんほうしゃ/現在HP不足のしおふき/まもるを混在させた200セル試験でも、通常結果との一致と部分失敗を確認した。
- productionはRULES_NOT_APPROVED、成功結果もfixture_only / gameVerified:falseを維持。

## L2結果と分類

`pnpm audit:l2:phase2b2` で再実行できる。根拠と入力条件、参照入力の実効値、全16値、自作段階トレースは [結果JSON](validation/phase-2b2-l2-results.json) に保存。

| 比較/除外の集合 | 一致 | 不一致 | 備考 |
|---|---:|---:|---|
| 5技の定義値 | 5 | 0 | generation 0の技リスト収録、威力/タイプ/分類/target/優先度 |
| 通常ダメージ | 32 | 0 | **各ケースの順序付き16乱数全て一致** |
| まもるのダメージなし分類 | 3 | 0 | Status/参照damage0と、自作nonDamagingの対応。16乱数のダメージ比較には数えない |
| 参照実装未対応による除外 | — | — | 3項目。じしん/いわなだれ/しおふきのDoublesで実命中1体 |
| 仕様未確認/自作未実装による除外 | — | — | 2項目。地面/グラスフィールド/接地相互作用と、まもるの相手攻撃防御処理 |

実行した戦闘条件は **35ケース（32ダメージ＋3分類）**。5件の定義照合や除外5項目と混ぜて件数を膨らませない。全6能力と実効状態を対応付け、実名の参照Moveを使った。しおふきは現在HPを明示し、参照側の満タン省略値で欠損を隠さない。免疫scalar0の正規化以外に、参照結果を丸め直す操作はしない。

比較には単体・2対象/じしん3対象、天候、STAB・複合相性、やけど、急所、3効果の発動/非発動、しおふきのHP1・87/175・104/207・テクニシャン59/60/61境界・てだすけを含む。例として、じしんの通常37〜44/ダブル複数28〜33、しおふきの満タン55〜65/HP87で28〜33、かえんほうしゃの晴れ51〜60が一致した。

**不一致は観測していない。** 算術バグを参照値に合わせて修正した箇所はない。既存のHP比式を維持し、その解決順を名前付き効果のために明示した。全組合せ・ゲーム本体での正しさは未確認。

## 未対応/比較できない条件

- 参照0.12.0のFieldに実命中対象数の入力はなく、Doublesの範囲targetは常に範囲補正される。Doublesで1体のみ命中するケースは自作L1で補正なしを確認したが、**参照のtargetを改変してL2一致とする操作はしていない**。Singlesへの置換もしていない。
- グラスフィールドのじしん軽減、重力/接地/空中状態、あなをほる等の個別条件は自作未対応。参照に実装が存在する条件も「参照未対応」とは呼ばず、自作側の未実装/未検証として扱う。入力できる未対応補助条件・terrainはunsupported、DTOにないフィールドはstrict検証でinvalid。
- 接地済みの飛行タイプへの地面技は既存ガードでunsupported。通常の飛行免疫のまま成功させない。
- Protectの防御成功率、連続使用、貫通・例外・相手のHP変動・優先度順の行動処理は今回実装していない。参照の防御処理の有無と自作の変化技分類を混同しない。
- いのちのたまの反動、特性/道具抑止原因の自動判定、追加効果・命中判定、実フォームの技習得/現行レギュレーション合法性は今回の完了範囲に含まれない。

## テスト・ビルド

| 検査 | 結果 |
|---|---|
| pnpm test | **241件成功**（既存195 + 今回44単体/アダプター + 2 L2ハーネステスト）、10ファイル |
| pnpm typecheck | 成功 |
| pnpm lint | 成功、warning 0 |
| pnpm contracts:check | 成功。保存DTO/生成OpenAPIと実行時スキーマに差分なし |
| pnpm audit:l2:phase2b2 | 5定義 + 35ケース一致、不一致0、除外5項目を記録 |
| pnpm build（通常Turbopack） | **失敗（環境依存）**。globals.cssのPostCSS処理用プロセスが内部ポートへbindする際のEPERM（Operation not permitted, os error 1）。前回と同じ原因 |
| pnpm exec next build --webpack | **成功**。コンパイル/TypeScript/静的ページ生成完了 |

Turbopackのログは `/var/folders/tf/cdp8q_q56qjdgbq5jp_ft8lc0000gn/T/next-panic-ad9be4207c11105cc7ce95f4554842a9.log`。設定・依存・ビルド環境の大規模変更はしていない。通常経路を再確認するには内部ループバック通信を許可したローカルターミナルで `pnpm build` を実行する。今回は通常Turbopackの成功とは報告しない。

TDDスキルに従い、モデル・L2ハーネス・定義不変性のテストを先に追加し、失敗を確認してから実装した。Singlesで複数対象は既存Phase 1検証でinvalidになるため、DTOを変更せずその経路を再利用した。既存Phase 2-Aの27ケース、2-B第1段階の324相性セル/24ダメージケースも自動テストで回帰確認した。実機/ブラウザE2Eは今回の対象外。

## 変更ファイルと現在の判定

- 新規 `src/lib/engine/champions-moves.ts`: 5技のモデルと出典付き効果定義。
- 変更 `src/lib/engine/contracts.ts`, `engine.ts`: 名前付き技variant、モデル照合、対象数検証、証跡、HP不足・M0順序。
- 新規 `tests/champions-moves-fixtures.ts`, `champions-moves.test.ts`, `champions-moves-l2.test.ts`: 明示fixture、単体/通常・200セル/実名L2試験。
- 変更 `scripts/audit/l2-comparison.ts`, `package.json`: 実名Move/動的威力/変化技の比較、`audit:l2:phase2b2`。
- 新規 本報告と結果JSON。変更 Phase 2報告/検証マトリクス/公開監査台帳/ライセンス加工表示。

限定した第2段階の登録・L2検査は実施済み。**Phase 2-B全体・Phase 2全体は未完了。** 実マスター/effectIdの正式統合、上記未対応条件・他の効果との相互作用、実機証跡が残る。Phase 3以降のDB/UI/認証/ランキング処理には進んでいない。

Phase 1の不足フォーム（Singles14/Doubles12）、不足特性（6/4）、技収録フラグ矛盾（6/3）、Paldean Tauros/Vivillon対応、未確定regulationは未解決。P0-05/P0-06の実機照合も未実施。本番接続/デプロイなし。**コード検査、L2一致、ゲーム本体での一致は別の判定として維持する。**
