# Phase 2 共通ダメージ計算エンジン実装報告

記録日: 2026-10-24（JST）。**Phase 2は部分実装・未完了**。基礎コアとL1算術テストを実装した。実際の技/特性/持ち物の効果登録、未対応モデル、独立参照実装との差分比較が残る。実機一致のP0-06は引き続き未検証。Phase 0は完了、Phase 1の実データの意味整合は未完了のまま維持する。

## 成果と利用制限

`src/lib/engine/` はUI・DB・ネットワーク・時計・乱数生成に依存しない純粋なTypeScriptモジュール。同一入力・同一カタログで同一結果を返す。カタログはfactoryでZod検証して複製し、呼び出し元が後から変更しても計算中の版を変えない。

```ts
const engine = createDamageEngine(explicitFixtureCatalog);
const result = engine.calculateDamage(request);
const normal = engine.calculateNormal(normalSavedInput);
const top50 = engine.calculateTop50(top50SavedInput, rankingDTO);
```

- 数値を返せるのは、明示的な`execution:'fixture'`と`verification:'fixture_only'`を持つ検証用カタログだけ。**製品用の承認済みルール/18タイプ表/実マスターは同梱していない**。
- `execution:'production'`は`unsupported / RULES_NOT_APPROVED`。リクエストに倍率やfixture許可フラグを混ぜてもstrict検証で拒否する。実データの収録フラグを書き換えて実行する迂回は実装していない。
- `ok`にも`verification:'fixture_only'`、`gameVerified:false`、全4版とsourceIds、命中した同条件の独立試行という前提を付ける。`ok`は「宣言されたfixtureの算術を実行できた」の意味。
- 失敗は`invalid / unsupported / missingContext`とコード、fieldPaths、missingKeys、messageKeyを返し、rolls/range/確率を返さない。直接ダメージのないモデルは`nonDamaging`。未対応効果を0倍率/等倍へ変換しない。
- batchの`status:'ok'`はセル評価完了を意味する。個々のセルのstatusを必ず確認する。4技すべてがunsupportedでもbatchの完了と数値成功を混同しない。

## 実装したルール（すべてfixtureモデル）

| 分類 | 実装 | 検証の範囲 |
|---|---|---|
| 能力値 | Lv50、HP=B+75+P、非HP=floor((B+20+P)×性格倍率)、全6能力保持 | 合法性格/ポイントはPhase 1を再利用。0.9/1.1は9/10・11/10の整数演算 |
| 逆算 | 標準式のポイント0..32を全探索、合計66の残予算、前の値に近い→小さいP | 不成立はnull。特殊HPモデルの逆算は未実装 |
| 特殊HP | 明示的な`fixedHp1`モデルのみ演算可能 | 実際のフォームへは紐付けていない |
| ランク | −6..+6、能力ランクの分数を切り捨て | 急所時に負の攻撃ランク/正の防御ランクを無視する候補処理 |
| 基礎ダメージ | floor(floor(22×power×attack/defense)/50)+2 | 設計例A182/D189/P100→44の一致 |
| 丸め | floor / half-up / half-downをBigInt商と余りで明示 | 0.5境界、5324/5325、段階適用と一括乗算の差を検査 |
| 相性 | 注入したタイプ表で単/複タイプと免疫0、タイプ重複拒否 | 表の欠落はunsupported。fixtureの4タイプ以外の実際の相性は承認していない |
| STAB | タイプ一致を乱数後・相性前に適用 | 倍率はfixture rulebookに明示。てきおうりょく等の実特性は未登録 |
| 16乱数 | 85..100の16値、各値でfloor、同値も頻度として保持 | ゲームの段階数/等確率を実証したわけではない |
| 戦闘条件 | 晴れ/雨の炎水、明示急所、複数命中した範囲技、物理/特殊の壁、やけど、てだすけ | 係数はrulebookから。ダブルだけで範囲補正を付けず、壁とVeilを重ねない候補処理 |
| 固定値モデル | 明示した固定ダメージを通常式と別経路で処理 | 非中立倍率効果との組合せはunsupported。実際の固定技/割合技の網羅ではない |
| HP連動モデル | max(1,floor(指定威力×現在HP/最大HP)) | 現在HPがnullならmissingContext。実際のしおふき等の登録はしていない |
| 効果レジストリ | syntheticなneutral / immunity / phase multiplier / unsupported | P1・A1・D1・F4ごとに適用。同フェーズの曖昧な順序は拒否。実際の効果ではない |
| KO | 分布の頻度をBigIntで畳み込み、最速nと確定n、最速n回時の既約分数 | 同条件で命中した独立試行、回復/命中率/追加効果率なし。0ダメージや確定数なしも区別 |
| HP表示用データ | 与ダメージ割合は最大HP分母、残HP範囲は現在HP基準 | 割合も分子/分母の文字列で返し、JSON化でBigIntを失わない |
| 表示用確率 | 切り捨て/四捨五入を明示指定する独立関数 | 9/16は内部56.25%。56.2/56.3の最終UI採用方針は決定していない |

処理順は `検証→フォーム/効果解決→動的威力→無効判定→P1/P2→A1→D1→B1→F1(範囲/天候/急所)→F2乱数→F3一致/相性/やけど→F4→F5下限→KO`。係数合成はhalf-up、適用はhalf-downの候補モデルを明示する。これは設計の候補順序をfixtureで再現したもので、Championsの正確な補正順序が確定したという主張ではない。

各結果のtraceにphase・before/after・modifier4096・rounding・effectId・抑止理由を付ける。基礎44や最終16値をtraceから追跡できる。sourceIds/版は結果全体に付与し、非中立効果の同一orderは`AMBIGUOUS_EFFECT_ORDER`で停止する。

## 未対応・未検証

- 実名の特性/持ち物の効果は**登録0件**。テクニシャン、ちからもち、こんじょう、マルチスケイル、かたやぶり、吸収、いのちのたま等を推測で実装していない。テスト上の2倍攻撃/5324補正はsyntheticなIDと明示係数だけ。
- 全フィールド、砂の岩特防、雪の氷防御、天候無効化、味方の特性/補助条件、接地判定、抑止優先順位、道具無効/消費は未対応。該当入力はunsupported。
- 多段技、重量/素早さ参照、別能力参照、タイプ/対象範囲が変わる技、割合HP技、反動/吸収/ターン回復、メガの合法な前後関係や石との組合せは未対応。
- KO計算は128hit/10,000状態/1,000,000遷移を上限とする。病的な入力で上限に達したら推定確率を返さず`KO_RESOURCE_LIMIT`で数値結果を止める。確定ダメージなど自明なケースは反復せず厳密に処理する。
- 本番全効果の分類網羅性、独立ライブラリとのL2差分、L3のゲーム観測は未完了。全47ケースの完了とはしていない。
- 200セルの算術整合は検査したが、画面描画込み/実スマホの3秒目標は今回の検証対象外。

## DTOとの整合性

- Phase 1の`PokemonBuild`、`BattleContext`、4種の`SourceVersions`を再利用。保存用v1、natureId必須、全6ポイント、全5性格倍率・ランク、3態持ち物、フォームID単一正本を変更していない。
- 計算単位の`DamageRequest`は保存入力の1技分を参照するstrict構造。新たなlevel、isMega、任意倍率、保存結果フィールドは追加していない。
- 計算前にPhase 1のマスター-aware validatorを呼び、さらに最大HP、実装モデル/効果、ルール版を検査する。既知だが習得外の技は、計算モデルが存在すれば演算可能。
- マスターにないID/不正buildはinvalid、既知でも未確認のフォームや未実装効果はunsupported、実装したHP連動モデルで現在HPがない場合はmissingContext。
- マスター/ルール/効果の実装詳細は`EngineCatalog`という信頼境界側の別契約。現行master DTOに演算属性を推測で足していない。型が正しい実データでもルールが未承認なら製品で数値は出ない。
- 通常とTOP50の両アダプターが**同一のcalculateDamage**を呼ぶ。snapshot/形式/entryの不整合を拒否し、型なしの行だけmissingContext、未対応技のセルだけunsupportedを維持する。
- OpenAPI/APIルートに変更なし。React画面・DB・Auth・ランキング自動取得に接続していない。

## テスト結果

| 対象 | 結果 |
|---|---|
| テスト先行 | 数学モジュールとエンジンが存在しない状態の失敗を確認してから実装。追加境界3件の失敗も確認して修正 |
| 算術/KO | 27件成功。BigInt境界、逆算、分布畳み込み、独立全列挙との一致、表示方針の分離 |
| エンジン/アダプター | 39件成功。5状態、補正順、未確認効果の数値非流出、200セル、通常との完全一致、欠損行/override/別形式拒否 |
| 全自動テスト | **145件成功（既存79＋今回66）** |
| 型チェック | `pnpm typecheck`成功 |
| Lint | `pnpm lint`成功、警告0 |
| OpenAPI | `pnpm contracts:check`成功、生成差分なし |
| 本番ビルド | `pnpm build`成功。ローカル成果物のみ、デプロイなし |
| 独立計算ライブラリとのL2比較 | 未実施。外部ライブラリやコードの流用なし |
| P0-06 L3 / P0-05 | 未実施・未検証のまま |
| UI/E2E | 今回はUI変更/接続がないため再実行していない。200セルは純粋コアの自動試験 |

先行v1.1は実装記録だけを参考にし、ソース・テスト値を無条件に継承していない。設計にある44/16値の例は算術fixtureとして検査したが、ゲーム版・観測映像を持つL3 goldenとして登録していない。

## 変更ファイル

- `src/lib/engine/contracts.ts` — 計算依頼/カタログ/結果/traceの共通契約。
- `src/lib/engine/math.ts` — 安全な整数比・4096合成・能力値/逆算/ランク・基礎式。
- `src/lib/engine/ko.ts` — 頻度を保持した厳密KO・既約分数・独立フォーマッタ。
- `src/lib/engine/engine.ts` — 状態判別、実行ゲート、モデル解決、順序付き補正、共通normal/TOP50アダプター。
- `tests/engine-fixtures.ts` — 50フォームの明示的な架空カタログ/ルール（製品データではない）。
- `tests/engine-math.test.ts`、`tests/damage-engine.test.ts` — L1/契約/部分失敗・共通コア試験。
- `docs/phase-2-report.md`、`docs/phase-2-verification-matrix.md`、README、公開監査台帳 — 対応範囲と未完了項目を更新。

## 持ち越しデータ不整合と次の条件

Phase 1の実データ検証で判明した不足フォーム（Singles14/Doubles12）、不足特性（6/4種類）、技収録フラグ矛盾（6/3種類）、Paldean Tauros/Vivillonの一意なフォーム対応、未確定regulationはそのまま残る。根拠なくconfirmed/verifiedへ変更していない。

Phase 2の残作業は、証拠/仕様に基づいた実効果と特殊モデルの登録・相互作用の検証、L2差分ハーネス、必要な計算支援範囲の確定。**数学的内部整合とゲーム本体との一致は別**であり、P0-06のL3は実装完了判定とも独立の公開ゲートとして残す。後続Phaseの実装・デプロイはしていない。
