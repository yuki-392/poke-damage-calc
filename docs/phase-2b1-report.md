# Phase 2-B 第1段階: 18タイプと指定3効果

2026-10-24（JST）。指定された限定範囲をL2候補ルールとして実装・検証した。**Phase 2-B全体・Phase 2全体は未完了。P0-05/P0-06のL3は未実施。** Phase 2-Aはユーザー確認済みの完了状態を維持する。

## 利用可能性と根拠の扱い

参照版は `@smogon/calc@0.12.0`、npm gitHead `d7a69cf40616057ef40faf7623df7a628e58b535`。インストール済みのソースと配布JSを確認した。下記の3項目はいずれもChampions専用リスト（generation 0）に収録され、専用メカニクス内に演算経路がある。通常の全国図鑑一覧に存在することだけを根拠にはしていない。

| 対象 | 参照収録根拠 | 計算根拠 | 当アプリでの状態 |
|---|---|---|---|
| 18タイプ表 | [CHAMPIONSの表](https://github.com/smogon/damage-calc/blob/d7a69cf40616057ef40faf7623df7a628e58b535/calc/src/data/types.ts) | 同表を参照する専用計算経路 | reference_listed / supported_unverified |
| テクニシャン | [CHAMPIONS特性リスト](https://github.com/smogon/damage-calc/blob/d7a69cf40616057ef40faf7623df7a628e58b535/calc/src/data/abilities.ts) | [BPMods](https://github.com/smogon/damage-calc/blob/d7a69cf40616057ef40faf7623df7a628e58b535/calc/src/mechanics/champions.ts#L742-L751) | 同上 |
| ちからもち | 同上 | [AtMods](https://github.com/smogon/damage-calc/blob/d7a69cf40616057ef40faf7623df7a628e58b535/calc/src/mechanics/champions.ts#L927-L932) | 同上 |
| いのちのたま | [CHAMPIONS持ち物リスト](https://github.com/smogon/damage-calc/blob/d7a69cf40616057ef40faf7623df7a628e58b535/calc/src/data/items.ts) | [FinalMods](https://github.com/smogon/damage-calc/blob/d7a69cf40616057ef40faf7623df7a628e58b535/calc/src/mechanics/champions.ts#L1164-L1166) | 同上 |

これは**固定された独立参照実装での収録確認**であり、現行ゲームの特定レギュレーションでの合法性・利用可能な全フォーム・自分たちの実機観測を承認する状態ではない。Phase 1の実マスターのinclusionやchampionsVerified等の上流フラグは変更・昇格していない。今回は新たなマスター全件取得・DB取り込みを行っていない。

公開研究にはちからもちを技威力の強化と説明する[議論](https://www.smogon.com/forums/threads/champions-battle-mechanics-research.3780372/page-6)もあるが、説明文と演算フェーズを同一視しない。既存詳細設計と固定参照実装のA1処理が一致するので、**通常物理技の攻撃能力補正**を採用候補とした。Body Press/Foul Play等の別能力参照は未対応のまま。L3で決着したという主張はしない。

相性の数値関係は同ソースから必要な事実表を転記・IDを小文字に正規化した。コードを丸ごと移植せず、実行時にも参照ライブラリから表を取得しない。MIT原文・著作権表示はTHIRD_PARTY_NOTICES.md、当モジュールのヘッダーに出典と加工を記載。Smogon Web説明文の転載、ゲーム画像の追加はない。

## 実装ルール

| 項目 | 発動条件・フェーズ・補正 | 非発動・抑止・未対応 |
|---|---|---|
| タイプ相性 | 18×18=324セル。攻撃タイプ→防御タイプ。F3でSTAB後に単/複タイプを乗算しfloor。免疫は0を維持 | 表の欠損/未知タイプはunsupported。地面→明示的に接地済みの飛行タイプはGROUNDED_TYPE_INTERACTION_UNSUPPORTED。重力等を推測しない |
| テクニシャン | 攻撃側の有効な特性。通常モデルの元威力が60以下（1〜60）。物理/特殊ともP1=6144/4096。てだすけ等のP1倍率を掛ける**前**に閾値判定 | 威力61以上は発動なし。防御側所持は今回の与ダメージに適用なし。明示抑止なら補正なし。動的威力/固定技との適用は未対応 |
| ちからもち | 攻撃側の有効な特性。通常物理技のA1=8192/4096。ランクをfloorした攻撃値へ適用。急所のランク無視は既存順序を再利用 | 特殊技は発動なし。防御側所持/明示抑止は適用なし。攻撃を参照しない特殊技等は未対応 |
| いのちのたま | 攻撃側の有効な道具。通常物理/特殊技のF4=**5324/4096**。壁等のF4と宣言順に合成 | 防御側所持/明示抑止は今回の与ダメージに適用なし。変化技はnonDamaging。固定技等は未対応。使用者への反動は別の処理であり今回実装しない |

係数合成は4096基準のhalf-up、適用はhalf-down（ちょうど0.5なら切り下げ）。通常乱数85..100はfloor。てだすけはP1の組合せとして合成し、ちからもちを威力に直接乗算しない。実装した候補の内部順序値は100/200/300で、将来の他の実効果との順序を承認したものではない。曖昧な同一orderや同一実名効果の別名重複は拒否する。

今回の3効果そのものの登録見送りはない。ただし、上表の未対応モデル、抑止原因の自動判定、いのちのたま反動・反動による攻撃者の撃破/複数ターン変化は見送った。KOは既存の「同一条件で命中する独立試行」のままであり、反動込みの継続攻撃確率ではない。結果にもその前提を付記する。

## DTO互換性と状態不足の扱い

Phase 1のbuild/BattleContext/保存DTO/OpenAPIは変更していない。既存の補助条件 `moveEffect` と、マスターeffectの登録済み `optionIds` を使用する。例は**検証fixtureのID**であり、実マスターを承認するサンプルではない。

```ts
{ kind: 'moveEffect', effectId: 'champions:technician', optionId: 'active' }
{ kind: 'moveEffect', effectId: 'champions:lifeOrb', optionId: 'suppressed' }
```

- 攻撃側の該当実名効果にはactive/suppressedの明示が必要。欠損は `missingContext / EFFECT_ACTIVITY_REQUIRED`。activeは呼び出し元が有効性を解決済みという契約であり、エンジンがその原因を推測する値ではない。
- 「いえき」「かがくへんかガス」「マジックルーム」「ぶきよう」等の自動判定は未実装。それらを表す未対応補助条件が付けばunsupported。無条件に効果なしへ落とさない。
- 防御側のこれら3効果は今回の受ける通常ダメージへ影響しないため、activityを要求せずoutgoing_onlyとしてトレースする。無関係なactivity指定はunsupported。
- 不明option、重複option、種別を取り違えた登録（道具効果を特性に結合）、不正威力は拒否する。nonDamagingはダメージ数値を返さない。
- `EngineCatalog`側だけに名前付き効果variantとルール証跡を追加。既存synthetic multiplier variantは保持。名前付き定義には参照版・出典URL/ID・確認日・reference_listed・supported_unverifiedを持たせる。候補版には架空のL3証跡を登録できず、将来の製品用承認は別のルール/承認設計で扱う。
- sourceIdsを計算結果と発動/抑止traceに連結。`execution:'production'`拒否、`fixture_only`、`gameVerified:false`は維持。
- 通常/TOP50のAPIは同じcalculateDamageを呼ぶ。今回追加したテクニシャン+いのちのたまの200セル試験でも、同じ入力条件の通常計算と全セルが一致した。

## L2比較結果

既存の `scripts/audit/l2-comparison.ts` に共通比較関数を抽出し、既存Phase 2-Aの27ケースを維持した。今回の追加結果は [phase-2b1-l2-results.json](validation/phase-2b1-l2-results.json)。実データの穴を埋めず、syntheticフォーム・通常技を用い、参照側には種族値/実数値/性格/ポイント/有効な特性・道具/条件を対応付けた。

| 比較集合 | 一致 | 不一致 |
|---|---:|---:|
| タイプ表のセル値 | 324 | 0 |
| 指定効果のダメージケース（各16乱数） | 24 | 0 |
| 既存Phase 2-A（回帰テスト） | 27 | 0 |

タイプの324セルは表の比較であり、324の戦闘ケースを実行したという意味ではない。今回の24ケースには、テクニシャンの威力1/59/60/61/95、特殊、てだすけ、抑止、いのちのたまとの複合、ちからもちの物理/特殊/負ランク切り捨て/急所/やけど/複合/抑止、いのちのたまの物理/特殊/抑止/複合/ダブル壁/2対象範囲/タイプ免疫/奇数威力を含む。

ダメージ前に両者の全6能力の一致を確認し、最小/最大のみでなく順序付き16値を比較。参照の免疫scalar 0だけ16個の0へ正規化。抑止ケースは参照側をNo Ability/道具なしにして**解決済み状態**を比較したもので、抑止原因自体を参照側と再現した試験ではない。入力の対応と自作トレースをJSONに保存した。

不一致は観測していない。未確認のChampionsルールを参照値に合わせて変更した箇所はない。接地済み飛行の誤った通常免疫適用はL2一致による修正ではなく、対応外条件を数値停止させる安全修正として回帰テストを追加した。

## 自動検査と環境制限

| 検査 | 結果 |
|---|---|
| pnpm audit:l2:phase2b | 324セル + 24ダメージケース一致、不一致0 |
| pnpm test | **195件成功**（既存147 + 名前付き効果等46 + 追加L2ハーネス2） |
| pnpm typecheck | 成功 |
| pnpm lint | 成功、warning 0 |
| pnpm contracts:check | 成功、生成OpenAPIと実行時契約に差分なし |
| pnpm build（Turbopack） | 環境制限で失敗。CSS処理用プロセスの内部ポートbindがEPERM。権限付き再試行でも同じ原因 |
| pnpm exec next build --webpack | **本番ビルド成功**。コンパイル・TypeScript・静的生成完了 |

テストは実装前に追加して失敗を確認した。後から追加した「接地済み飛行を等倍/免疫へ推測しない」試験も失敗を確認後に実装した。開発中の型エラー（参照APIのIDブランド型）はtoID変換で解消済み。通常のTurbopack経路の成功を偽っていない。通常ビルドを再確認する場合は、内部ループバック通信が許可されたローカルターミナルで `pnpm build` を実行する。今回の設定変更やデプロイは不要。

実機・ブラウザE2Eは今回の対象外。UI/DB/認証/ランキング自動更新への実装・接続はない。本番Supabase/Vercelへの接続・デプロイもない。

## 追加・変更ファイル

- 新規 `src/lib/engine/champions-rules.ts`: 18タイプ表、3効果の候補定義と版付き証跡。
- 変更 `src/lib/engine/contracts.ts`, `engine.ts`: 型付き定義・証跡、条件/抑止、適用フェーズ、失敗経路。
- 新規 `tests/champions-effects-fixtures.ts`, `champions-effects.test.ts`, `champions-l2.test.ts`: 明示fixture、46検査とL2比較。
- 変更 `scripts/audit/l2-comparison.ts`, `package.json`: 既存ハーネスの共通化、`pnpm audit:l2:phase2b`。
- 新規 本報告・結果JSON。変更 Phase 2報告・マトリクス・公開監査台帳・THIRD_PARTY_NOTICES.md。

## 残作業と判定

指定の限定実装とL2検査は実施済み。ただし通常Turbopackビルドの成功は環境上未確認。**Phase 2-B全体は未完了**で、他の実効果、特殊技/相互作用、抑止原因・道具無効化のモデル、実マスターとeffectIdの正式な統合、レギュレーションごとの合法性、L2拡充が残る。実技は今回追加登録していない。

Phase 1の不足フォーム（Singles14/Doubles12）、不足特性（6/4）、技収録フラグ矛盾（6/3）、Paldean Tauros/Vivillon対応、未確定regulationはそのまま。P0-05・P0-06の実機証跡はない。**L2での一致、コード検査の成功、ゲーム本体での一致は別の判定**として維持する。
