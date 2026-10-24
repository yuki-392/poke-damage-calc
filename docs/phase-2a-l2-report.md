# Phase 2-A: 独立参照実装との限定L2比較

記録日: 2026-10-24（JST）。**依頼された限定L2比較は実施済み。Phase 2全体は未完了。**

実行した数値比較は27ケース（能力値3、ダメージ24）。一致27、不一致0。別途、参照実装未対応1項目・仕様未確認2項目を除外として記録した。除外3項目を「比較成功」には数えない。ゲーム本体との一致を証明する結果ではない。

## 参照実装と採用範囲

- `@smogon/calc` **0.12.0**、npm gitHead `d7a69cf40616057ef40faf7623df7a628e58b535`。バージョン指定・配布物integrityはpackage.json / pnpm-lock.yamlに固定。
- [公式計算ルーティング](https://github.com/smogon/damage-calc/blob/d7a69cf40616057ef40faf7623df7a628e58b535/calc/src/calc.ts) とインストール済みJSで `Generations.get(0)` → `calculateChampions` を確認。SV（generation 9）の代用ではない。
- [Champions専用メカニクス](https://github.com/smogon/damage-calc/blob/d7a69cf40616057ef40faf7623df7a628e58b535/calc/src/mechanics/champions.ts) は通常式、16乱数、STAB、天候、急所、壁、やけど、範囲補正、てだすけを処理する。今回実際に実行したのは下記の限定条件だけ。実技・特性・持ち物・新フォーム全件の対応を保証しない。
- [能力値計算](https://github.com/smogon/damage-calc/blob/d7a69cf40616057ef40faf7623df7a628e58b535/calc/src/stats.ts) ではChampions用の式があり、EV引数を能力ポイントとして受け取る。Lv50を固定しIV入力は使用しない。
- 公式パッケージを優先候補として採用。同じライブラリを使う外部サイトを別の独立した計算実装としては数えなかった。依存は開発・検証専用であり、アプリのエンジンは置換しない。
- MITライセンスの著作権表示と原文は `THIRD_PARTY_NOTICES.md` に保存。技術判断は [ADR-0002](adr/0002-l2-reference.md)。製品採用の性能比較は今回実施していない。

## 入力対応と比較方法

共通DTOを変更せず、既存fixtureをstrict schemaで検証してから対応付けた。外部マスター不足を埋める操作は行っていない。

| 自作エンジン | 参照実装への対応 |
|---|---|
| 架空フォームのbaseStats | Pokemonのspecies overridesに明示。Mewをコンストラクタの器として使用し、種族値・タイプを上書き |
| hp/attack/defense/spAttack/spDefense/speed | hp/atk/def/spa/spd/spe |
| statPoints | Championsモードのevsへ直接転記。4倍やEV換算はしない |
| test-neutral / test-up | Serious / Adamant。性格倍率と共通DTOの一致を維持 |
| synthetic neutral ability / item none | No Ability / 空文字。元speciesのデフォルト特性を使わない |
| physical/special、威力、タイプ、対象 | 固有効果のない `L2 Synthetic Move` と明示overrides（flagsも空）。実技の登録・利用可能性の判定ではない |
| plain/fire/water/ghost/grass/steel | Normal/Fire/Water/Ghost/Grass/Steel。炎・ノーマルの必要な相性セルだけを明示定義し、参照データから自動複製しない |
| singles/doubles | Field.gameType Singles/Doubles |
| 晴れ/雨、急所、ランク、壁、やけど、てだすけ | Field、Move.isCrit、Pokemon.boosts/statusへ転記 |
| spread + targetsActuallyHit=2 | Doubles + allAdjacentFoes。1体のみ命中する場合にはこの対応を使わない |

ダメージ比較の前に、両者の全6能力の実数値一致を確認した。ダメージは85..100の**順序付き16要素全体**で比較し、最小・最大だけでは判定しない。参照実装の免疫結果はscalar 0なので、この場合に限り16個の0へ正規化した。参照側の出力は丸め直さない。

`docs/validation/phase-2a-l2-results.json` に入力、参照入力の実効値、両者の結果、判定、自作側の段階トレースを保存。基礎ケースはA182 / D189 / 威力100、B1=44で、両者とも `[37,37,38,38,39,39,40,40,40,41,41,42,42,43,43,44]`。

## 比較結果

以下の範囲表は読みやすさのための要約。判定には16値全体を使用した。

| 能力値ケース | hp/atk/def/spa/spd/spe（両者一致） |
|---|---|
| neutral-zero | 175 / 182 / 189 / 182 / 189 / 120 |
| adamant-points（32/32/2/0/0/0） | 207 / 235 / 191 / 163 / 189 / 120 |
| fixed-hp-one（明示fixtureモデル） | 1 / 182 / 189 / 182 / 189 / 120 |

| ダメージケース | 範囲（両者一致） |
|---|---|
| base-44、special | 37–44（各1ケース） |
| stab | 55–66 |
| resist-half、resist-quarter | 18–22、9–11 |
| weak-double、weak-quad | 74–88、148–176 |
| immune | 0–0 |
| sun、rain | 56–66、18–22 |
| critical | 56–66 |
| stages（攻撃+2、防御−1） | 109–129 |
| critical-ignores-stages（攻撃−2、防御+3） | 56–66 |
| critical-keeps-stages（攻撃+1、防御−1） | 123–145 |
| reflect-singles、reflect-doubles | 18–22、25–29 |
| light-screen、veil-no-stack | 18–22（各1ケース） |
| critical-ignores-wall | 56–66 |
| burn、special-burn | 18–22、37–44 |
| spread-two | 28–33 |
| helping-hand | 55–65 |
| combined-rounding（STAB/抵抗/晴れ/範囲/ダブル壁/やけど/てだすけ） | 15–18 |

**不一致0件**。今回の比較集合では端数処理・補正順序の差を観測せず、明確な算術バグは発見しなかった。したがって `src/lib/engine/` の修正はない。全ての境界値や補正組合せが正しいとする根拠にはならない。

## 比較を実行しなかった項目

| ID | 分類 | 根拠 |
|---|---|---|
| spread-one-survivor | 参照実装未対応 | 0.12.0のFieldには実命中対象数の入力がない。Champions処理はDoublesかつ範囲targetなら一律3072補正。1体だけに命中する条件を同一入力で表現できない。Singlesへの置換は壁等の条件も変えるため行わない |
| historical-fifteen-rolls | 仕様未確認 | 参照実装は16段階。旧版の15段階説を確定できるゲーム版付きL3証拠はなく、履歴の正誤を判断できない |
| named-effects-catalog | 仕様未確認 | Champions固有の実名効果、収録状況、例外相互作用は統合前。参照側に同名処理があっても、自作側の登録根拠として無条件に採用しない |

KO確率、HP連動/固定/連続技、全能力ランク境界、全性格、砂・雪・フィールド、特性/持ち物の組合せ等は今回の数値比較対象外。未対応を「参照実装が未対応」と一括扱いせず、上表以外は比較していない範囲として残す。

## 検証と変更ファイル

- TDD: 比較テストを先に追加し、ハーネス未作成による失敗を確認。その後にハーネスを実装した。
- `pnpm audit:l2`: 27比較・27一致・0不一致、除外3項目。再実行可能。ローカルfixtureのみで実行し、外部APIには接続しない。
- `pnpm test`: **147件成功**（既存145 + L2ハーネスの2テスト）。「テスト147件」と「比較ケース27件」は別の集計。
- `pnpm typecheck`、`pnpm lint`、`pnpm contracts:check`: 成功。
- UI/DB/実端末の検証と本番ビルドは今回追加実行していない。アプリコード・UI・DBは変更していない。

追加: `scripts/audit/l2-comparison.ts`、`tests/engine-l2.test.ts`、本報告、結果JSON、ADR-0002、THIRD_PARTY_NOTICES。
変更: `package.json`（検証コマンド・固定devDependency）、`pnpm-lock.yaml`、Phase 2報告と検証マトリクス。

## 判定と持ち越し

限定Phase 2-AのL2検証は完了。**Phase 2全体は未完了**。`execution:'production'` は `unsupported / RULES_NOT_APPROVED` を確認し、`gameVerified:false` と `fixture_only` を維持する。

Phase 1の不足フォーム（Singles14/Doubles12）、不足特性（6/4）、技収録フラグ矛盾（6/3）、Paldean Tauros/Vivillon対応、未確定regulationは変更していない。P0-05・P0-06の実機照合は未実施。後続Phase・大量効果登録・本番接続・デプロイは行っていない。L2一致とPokémon Champions本体での一致は別の判定である。
