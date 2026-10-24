# Phase 2-B 第4段階 — 防御3効果・シャドーボール

実施日: 2026-10-24。指定4対象の候補登録・限定実装・L2比較・TOP50再集計を実施。**Phase 2-B全体/Phase 2全体は未完了**。Phase 1の意味整合、P0-05/P0-06も未完了。`execution:'production'`はRULES_NOT_APPROVED、`gameVerified:false`を維持する。

## 根拠と対応範囲

設計docs/04、P0-06、効果カタログのPreImmunity/F4を確認した。固定参照は`@smogon/calc@0.12.0`、gitHead `d7a69cf40616057ef40faf7623df7a628e58b535`、generation 0のChampions経路。3効果と技のChampionsリスト収録を実行時にも確認した。参照リストの収録はゲーム/現レギュレーションの使用可能性、実フォーム習得、実機ダメージの承認ではない。

| 対象 | 登録した処理 | 適用箇所・端数 | 未対応条件 |
|---|---|---|---|
| ふゆう | 明示有効・重力なし・接地変更なしの地面技無効 | Immunity、最終16値を0。倍率の丸めなし | 重力、かたやぶり等の抑止機構、接地変更、未知の技モデル |
| ふうせん | 未消費かつ有効と明示された同条件の地面技無効 | Immunity、最終16値を0 | 重力、道具無効化、破裂/消費遷移、接地変更 |
| マルチスケイル | 現在HP=導出最大HP、初回単発、設置技なし、有効時の半減 | F4の2048/4096。壁→マルチスケイル→いのちのたまの順。4096合成halfUp、適用halfDown | 多段/2打目以降、設置技、効果無効化、回復を含む継続KO |
| シャドーボール | 威力80・ゴースト・特殊・単体のstandardモデル | 既存基礎式/16乱数/STAB/タイプ/F4。参照target=any、priority=0 | 追加効果の特防低下、対戦全体。ぼうだん等の未登録効果は停止 |

出典: [Champions計算](https://github.com/smogon/damage-calc/blob/d7a69cf40616057ef40faf7623df7a628e58b535/calc/src/mechanics/champions.ts)、[特性](https://github.com/smogon/damage-calc/blob/d7a69cf40616057ef40faf7623df7a628e58b535/calc/src/data/abilities.ts)、[持ち物](https://github.com/smogon/damage-calc/blob/d7a69cf40616057ef40faf7623df7a628e58b535/calc/src/data/items.ts)、[技](https://github.com/smogon/damage-calc/blob/d7a69cf40616057ef40faf7623df7a628e58b535/calc/src/data/moves.ts)。特に地面無効277〜298行、Multiscale1127〜1135行。MITの帰属はTHIRD_PARTY_NOTICES.mdを維持。

## 条件判定と契約

Phase 1保存DTO・OpenAPIに変更なし。既存`conditions.supplementary`の`moveEffect`を選択された個別effectIdにだけ結び付ける。EngineCatalogの新識別子`championsDefense`は今回の3効果だけを列挙し、一括承認/中立化しない。

| 分類 | 表現 | 例 |
|---|---|---|
| 発動 | 数値結果のtraceに`evaluation:'active'`、理由/出典 | 地面無効、満タン初回のF4半減 |
| 根拠に基づき非介入 | `evaluation:'inactive'`、理由 | 非地面技へのふゆう/ふうせん、HP最大未満のマルチスケイル、攻撃側の防御効果、変化技、既に無効な攻撃へのマルチスケイル |
| 情報不足 | `missingContext`とmissingKeys | 必要な有効状態/接地状態/現在HPの不足。`unknown-activity`の明示もこの分類 |
| 未対応/仕様未確認 | `unsupported`とcode/fieldPaths | 重力、設置技、多段、効果抑止。未知オプション自体はinvalid |

個別効果の`active-single-hit-clear-field`は、呼出側が「現在有効（ふうせんは未消費）・重力/接地変更なし・初回単発・設置技なし」を明示する限定条件であり、**既定値ではない**。地面無効には別途`defenderGrounded:false`が必要。nullは情報不足、trueは接地相互作用未対応。実データからこの条件を自動生成する処理はない。同名効果が両側にあっても補足条件は防御側にのみ作用する。

`gravity` / `entry-hazards` / `multi-hit` / `effect-suppression`は停止する。新3効果の抑止機構は実装せず、明示された抑止もunsupportedとして数値を返さない。旧3効果の契約は維持。影響しないと証明できる攻撃でも、明示された未対応相互作用を勝手に消さず停止する保守的な範囲とした。

マルチスケイルには現在HPが必須。最大HPを導出し、HP超過はinvalid。発動時の分布を反復すると2回目以降も半減してしまうため、**エンジン結果のKO型だけ**を最小拡張した。`ko.kind:'unavailable', reason:'STATEFUL_DEFENSE'`と正確な`oneHitProbability`を返し、n発確定数/連続撃破率を返さない。単発16分布と初回の残HPは返す。HP減少で非発動なら従来の条件一定IIDモデル。回復・生存処理・追加効果発生率は含まない。

## L2と自動検査

[比較証跡](validation/phase-2b4-l2-results.json)。syntheticフォーム・能力ポイント・性格・ランク・現在HPを参照へ対応し、実名の効果/技を保持。未承認の実マスターをfixtureへ投入していない。

- 数値比較 **45件一致・不一致0**: ふゆう/ふうせん各9件、マルチスケイル13件、シャドーボール14件。HP境界、範囲、STAB/相性、壁/急所/やけど/天候、ちからもち/テクニシャン/いのちのたまの対応可能な組合せを含む。
- 順序付き16値を比較。参照がscalar 0で返す無効14件のみ、同じ退化分布の16個の0へ展開した。乱数のゲーム仕様を証明したとは扱わない。
- 別枠でシャドーボール定義1件一致、3効果の参照Championsリスト収録確認成功。
- **参照実装未対応1項目**: ダブル範囲技の実命中1体。Fieldに実命中数APIがなく、シングルへの差替えで成功とは数えない。
- **仕様未確認/自作未対応6項目**: 重力/接地、特性抑止、道具抑止、設置技、多段、ふうせん消費。参照が一部を表現できても等条件の自作側がないため比較成功にしない。今回、No Ability/空道具への置換で抑止比較を行っていない。
- **全314自動テスト成功**（従来250 + 今回64）。追加内訳: 防御/技/状態/共通アダプター59、L2集約1、カバレッジ3、既存監査追加1。通常/TOP50の200セル一致を3効果それぞれで確認（計600セル、テスト内検査）。
- 型チェック、Lint、OpenAPI検査成功。`pnpm audit:l2:phase2b4`でJSON生成/差分0。既存L2の27件・324セル/24件・35条件も回帰テストで維持。
- 通常`pnpm build`は**失敗**: globals.cssのPostCSS評価→子プロセス→内部ポートbindでEPERM。`pnpm exec next build --webpack`は**成功**。ビルド設定の変更なし。UI変更がなくブラウザE2Eは今回追加実行していない。実機検証は未実施。

## TOP50候補カバレッジ

[集計証跡](validation/phase-2b4-coverage.json)。前回の生cacheは削除済みのため、meta-singles/meta-doublesの**2ファイルだけ**を一時取得し、両SHA-256が前回観測と一致することを確認。観測日時/hash/URLをJSONに記録した。前回と同じ集計式でbeforeを再計算し、既存9指標の一致を検査してafterを算出。固定マスター/API indexは再取得せず、データ解決/不足一覧は同一hashの前回監査値を明示的に再利用した。順位は`unverified_rank`、regulation未確定のまま。

| 指標 | Singles 前→今回 | Doubles 前→今回 |
|---|---:|---:|
| 特性名に候補ルールがある推定型（分母50） | 1→5（10%） | 0→1（2%） |
| 持ち物名に候補ルールがある推定型（分母50） | 1→2（4%） | 3→3（6%） |
| 特性・持ち物の両候補がある推定型（分母50） | **0→0** | **0→0** |
| モデル対応技枠（50型×4=200） | 15→18（9%） | 46→50（25%） |
| うちダメージ技枠（同200） | 14→17（8.5%） | 7→11（5.5%） |
| モデル対応の個別技言及（各10技×50=500） | 28→34（6.8%） | 66→72（14.4%） |
| うちダメージ技言及（同500） | 21→27（5.4%） | 19→25（5%） |
| 特性の候補対応言及（報告特性言及が分母） | 1→5 /105 | 0→1 /120 |
| 持ち物の候補対応言及（分母500） | 43→65 | 47→55 |
| 本番実行適格（分母50） | **0→0（0%）** | **0→0（0%）** |
| 実機ダメージ証跡保有（分母50） | **0→0（0%）** | **0→0（0%）** |

「候補」は条件付きモデルの存在だけを数え、HP/抑止/場の状態が解決済みとは意味しない。条件解決済み率と実データ計算成功率は**未測定**。今回の実データ計算実行/昇格は0。推定setの同居を数える両対応行も実測同時分布ではなく、周辺頻度を掛けて成功率を推定していない。

報告技の個別比率合計（percentage points、フォーム等重み・リスト打切りあり）では、全モデル対応S 1480.5/18826.6=7.8639%、D 4259.8/18951.0=22.4780%。ダメージモデルのみS 1281.8/18826.6=6.8085%、D 1137.7/18951.0=6.0034%。報告ダメージ技だけを分母にするとS 1281.8/13450.7=9.5296%、D 1137.7/11611.6=9.7980%。人口使用率/実際の攻撃成功率ではない。Protectは分類のみでダメージ分子から除外。

データ解決は前回の**36/50・38/50のまま**。フォーム不足14/12、代表型の特性名辞書不足6行/5行、Phase 1の技収録フラグ矛盾、性格/ポイントの元欠損と既定値の区別、Stat Alignment実機対応等を解消していない。参照ルール追加を理由に実マスターを書き換えていない。

帰属: **Battle data provided by [Pokémon Champions Battle Data](https://championsbattledata.com/)**。[利用規約](https://championsbattledata.com/api-rules/)を再確認。一時cacheで集計し、生レスポンスの恒久保存/公開はせず、検査後に今回のcacheを削除した。候補マスターの帰属/CC BY 4.0/加工表示はJSONと前回報告を維持。

## 変更と残作業

- 新規: src/lib/engine/champions-defense.ts、tests/champions-defense-fixtures.ts、champions-defense.test.ts、phase2b4-l2.test.ts、phase2b4-coverage.test.ts、scripts/audit/phase2b4-l2.ts、phase2b4-coverage.ts、本報告、集計JSON2点。
- 更新: engine.ts/contracts.ts/champions-moves.ts、既存L2/監査ハーネス、move fixture、damage-engine/top50-coverageテスト、package.json、Phase 2報告/検証マトリクス/公開監査台帳。Phase 1保存契約・実マスター・DB/UIは変更なし。
- 次の優先課題: ①未解決フォーム/特性のデータとカタログ結合条件、②抑止/接地/設置技の明示モデルと等条件L2、③たべのこし/きあいのタスキ等について単発ダメージと回復/生存/継続KOを分離する仕様・証拠整備。
- 今回は大量登録/後続Phaseへ進んでいない。ゲームとの一致は未測定。L2をL3へ昇格せず、P0-05/P0-06の証跡取得と公開ゲートを継続。本番接続・デプロイ・課金設定変更なし。
