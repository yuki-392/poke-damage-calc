# 計算効果・特殊技の候補レジストリ v1.2

**設計候補であり、網羅済み・実機検証済みのリストではない。** この表に挙げた名称が現行Championsで利用可能とは限らない。レギュレーション別の収録確認、補正順のゲーム内照合、特性阻害条件の検証が必要。効果の「Wiki」はChampions育成考察Wikiの計算式ページに登場することを指す（実機検証とは異なる）。

最初の実装監査ではゲーム内マスターデータにある全IDとの集合差分を取り、未分類の技・特性・持ち物を**0件**にする。`prototype_implemented` と `verified_in_game` は別状態として管理する。

| 区分 | effectId | 対象/効果 | フェーズ | 必要な文脈 | 契約・注意 | 優先度 | 根拠 |
|---|---|---|---|---|---|---|---|
| environment | ENV-SUN | 晴れ | F1 | 天候・技タイプ | 炎強化／水弱化。天候無効化を先に判定 | P0 | Wiki |
| environment | ENV-RAIN | 雨 | F1 | 天候・技タイプ | 水強化／炎弱化。天候無効化を先に判定 | P0 | Wiki |
| environment | ENV-SAND | 砂嵐 | D1 | 防御側タイプ・参照能力 | 岩タイプの特防補正。天候無効化先行 | P0 | Wiki |
| environment | ENV-SNOW | 雪 | D1 | 防御側タイプ・参照能力 | 氷タイプの防御補正。天候無効化先行 | P0 | Wiki |
| environment | ENV-SPREAD | ダブル範囲補正 | F1 | ダブル・範囲技・実命中数 | 複数対象に命中するときのみ0.75倍 | P0 | Wiki |
| environment | ENV-SCREEN | 壁・オーロラベール | F4 | 防御側の壁・ダブル・急所 | 物理/特殊を区別。急所で無視。重複の扱いを明示 | P0 | Wiki |
| environment | ENV-TERRAIN | フィールド | P1/F4 | 接地・技タイプ・技ID | 電気・草・超強化、ミスト竜軽減、草の地震系軽減など技別 | P0 | Wiki |
| environment | ENV-CRIT | 急所 | A1/D1/F1 | 急所フラグ・防壁 | 不利攻撃ランク/有利防御ランクを無視、壁除外 | P0 | Wiki |
| environment | ENV-BURN | やけど | F3 | 攻撃者状態・特性・技 | 物理半減の例外を効果IDで管理 | P0 | Wiki |
| environment | ENV-HELP | てだすけ | P1 | 味方サポートの有無 | 威力フェーズ。最終補正に二重計上禁止 | P0 | Wiki |
| environment | ENV-GROUND | 接地判定 | Pre | タイプ・特性・道具・場 | フラグだけでなく導出/明示の根拠を保存 | P0 | 要実機確認 |
| move | MOVE-BRINE | しおみず | M0/P1 | 相手現在HP/最大HP | 条件成立時に威力を変更 | P1 | Wiki |
| move | MOVE-FACADE | からげんき | M0/P1 | 攻撃者状態異常 | 状態異常下の威力増・やけど半減との相互作用 | P0 | Wiki |
| move | MOVE-VENOSHOCK | ベノムショック | M0/P1 | 防御側の毒/猛毒状態 | 威力変更。実装後ゴールデンテスト | P1 | Wiki |
| move | MOVE-ACROBATICS | アクロバット | M0 | 持ち物の所持・消費状態 | 基本威力変更型。補正フェーズとの重複禁止 | P1 | Wiki |
| move | MOVE-HEX | たたりめ | M0/P1 | 相手状態異常 | 状態異常条件の威力変化・分類の確認 | P1 | 要資料照合 |
| move | MOVE-GYROBALL | ジャイロボール | M0 | 双方素早さ実数値 | 威力計算・上限・切り捨ての技固有定義 | P1 | 要資料照合 |
| move | MOVE-GRASSKNOT | くさむすび | M0 | 相手の重量 | 重量テーブルを使用。未取得ならmissingContext | P1 | 要資料照合 |
| move | MOVE-HEATCRASH | ヒートスタンプ | M0 | 双方重量 | 重量比で威力が変わる。変換時の丸め固定 | P1 | Wiki |
| move | MOVE-BODYPRESS | ボディプレス | A1 | 攻撃側防御と対応ランク | 攻撃側防御を攻撃能力参照に切替 | P0 | 要資料照合 |
| move | MOVE-FOULPLAY | イカサマ | A1 | 防御側攻撃実数値・ランク | 相手攻撃の利用と特性補正範囲を検証 | P1 | 要資料照合 |
| move | MOVE-PSYSHOCK | サイコショック | D1 | 防御側防御 | 特殊技だが防御参照 | P0 | 要資料照合 |
| move | MOVE-WATER-SPOUT | しおふき | M0 | 攻撃者の現在HP/最大HP | HP比で威力変化 | P1 | 要資料照合 |
| move | MOVE-ERUPTION | ふんか | M0 | 攻撃者の現在HP/最大HP | HP比で威力変化 | P1 | 要資料照合 |
| move | MOVE-EARTHQUAKE | じしん | F1/F4 | 命中対象数・グラスフィールド・相手のあなをほる | 範囲補正と個別条件を別効果として処理 | P0 | Wiki |
| move | MOVE-ROCKSLIDE | いわなだれ | F1/UI-meta | 命中対象数 | 範囲補正。30%ひるみは表示メタデータ | P0 | 要技データ照合 |
| move | MOVE-EXPANDING | ワイドフォース | M0/P1 | サイコフィールド・接地・範囲 | 威力/対象範囲の変更条件を技固有定義 | P1 | Wiki |
| move | MOVE-WEATHERBALL | ウェザーボール | M0 | 天候の実効状態 | タイプ/威力変化、天候無効化を反映 | P1 | 要資料照合 |
| move | MOVE-SOLARB | ソーラービーム | P1 | 天候 | 特定天候で威力が変わるケース | P1 | Wiki |
| move | MOVE-MULTI | ロックブラスト等の連続技 | Distribution | ヒット数分布・ヒット間の状態 | ダメージ分布をヒット毎に合成。追加効果と独立管理 | P1 | 要実機確認 |
| move | MOVE-FIXED | ちきゅうなげ等の固定ダメージ | Distribution | 使用者レベル・相手HP | 通常の基礎ダメージ式を経由しない | P1 | 要実機確認 |
| move | MOVE-HALFHP | いかりのまえば | Distribution | 相手現在HP | HP割合を直接算出。最低値/丸めの検証要 | P1 | 要実機確認 |
| move | MOVE-STATUS | まもる等の変化技 | NonDamage | 技の分類 | nonDamagingで返す。命中率等は本機能外 | P0 | マスター属性 |
| ability | ABL-TECH | テクニシャン | P1 | 実際の威力/技特性 | 閾値条件成立時だけ威力を補正 | P0 | Wiki |
| ability | ABL-HUGE | ちからもち | A1 | 物理参照能力 | 攻撃実数値への倍率。急所・ランクとの順を検証 | P0 | Wiki |
| ability | ABL-PURE | ヨガパワー | A1 | 物理参照能力 | 攻撃実数値への倍率 | P1 | Wiki |
| ability | ABL-GUTS | こんじょう | A1/F3 | 攻撃者状態 | 攻撃補正とやけど物理半減例外を定義 | P0 | Wiki |
| ability | ABL-SOLAR | サンパワー | A1 | 実効天候・特殊技 | 特攻補正。天候無効時の扱いを区別 | P1 | Wiki |
| ability | ABL-FUR | ファーコート | D1 | 防御側・物理分類 | 物理防御の能力補正 | P1 | Wiki |
| ability | ABL-SCALE | マルチスケイル | F4 | 防御側現在HP=最大HP | 満タン時の被ダメージ軽減 | P0 | Wiki |
| ability | ABL-FILTER | フィルター | F4 | タイプ相性 | 効果抜群時のみ被ダメージ軽減 | P1 | Wiki |
| ability | ABL-FRIEND | フレンドガード | F4 | 味方配置/生存・範囲 | 味方による被ダメージ軽減、重複の扱いを検証 | P1 | Wiki |
| ability | ABL-TOUGH | かたいツメ | P1 | 接触技タグ | 接触技のみ威力補正 | P1 | Wiki |
| ability | ABL-JAW | がんじょうあご | P1 | かみつき技タグ | 指定技のみ威力補正 | P1 | Wiki |
| ability | ABL-SHARP | きれあじ | P1 | 斬撃技タグ | 指定技のみ威力補正 | P1 | Wiki |
| ability | ABL-ADAPT | てきおうりょく | F3 | 攻撃者タイプ・技タイプ | タイプ一致計算を置換。2重掛け禁止 | P0 | Wiki |
| ability | ABL-LEV | ふゆう | Pre-Immunity | 技タイプ・相手特性抑止 | 地面無効条件。接地判定への影響 | P0 | 要ゲーム版照合 |
| ability | ABL-VOLT | ちくでん | Pre-Immunity | 技タイプ・相手特性抑止 | 電気技吸収/無効。数値ダメージ0のほか回復等を結果に注記 | P1 | 要ゲーム版照合 |
| ability | ABL-FLASH | もらいび | Pre-Immunity/A1 | 炎技・状態フラグ | 無効と発動後の強化を分離 | P1 | Wiki |
| ability | ABL-MOLD | かたやぶり | Pre-Suppress | 相手特性ID | 阻害対象かどうかのリストを監査 | P1 | 要実機確認 |
| ability | ABL-NEUTRAL | ダメージ無関係の監査済み特性 | NoOp | 効果と条件 | 監査済みと証明できるときだけno-op | P0 | 要効果監査 |
| item | ITEM-LIFE | いのちのたま | F4 | 道具有効性 | 固定小数5324候補。反動は単発ダメージ分布と分離 | P0 | Wiki |
| item | ITEM-CHOICEB | こだわりハチマキ | A1 | 物理技・道具有効性 | 攻撃能力補正 | P1 | Wiki |
| item | ITEM-CHOICES | こだわりメガネ | A1 | 特殊技・道具有効性 | 特攻能力補正 | P1 | Wiki |
| item | ITEM-EVIOLITE | しんかのきせき | D1 | 進化可能形態判定 | 防御/特防補正。フォルム別合法性 | P1 | Wiki |
| item | ITEM-VEST | とつげきチョッキ | D1 | 特殊技・道具有効性 | 特防補正 | P1 | Wiki |
| item | ITEM-BOOST | タイプ強化アイテム群 | P1 | 道具と技タイプ | 一致した技威力のみ補正。個別itemId対応 | P1 | Wiki |
| item | ITEM-BAND | ちからのハチマキ | P1 | 物理技 | 指定技威力補正 | P1 | Wiki |
| item | ITEM-GLASSES | ものしりメガネ | P1 | 特殊技 | 指定技威力補正 | P1 | Wiki |
| item | ITEM-EXPERT | たつじんのおび | F4 | タイプ相性 | 効果抜群時のみ最終補正 | P1 | Wiki |
| item | ITEM-BERRY | 半減きのみ | F4 | 技タイプ・初撃・使用済み | 該当タイプの被ダメージ軽減・消費状態 | P1 | Wiki |
| item | ITEM-LEFT | たべのこし | PostTurn | ターン経過 | 基本のKO乱数率には混ぜない。別モジュールで処理 | P2 | 効果概念 |
| item | ITEM-MEGA | メガストーン | Form | フォーム・合法性 | メガ形態移行のチェック。単純な威力倍率ではない | P0 | ゲーム固有 |
| item | ITEM-UNKNOWN | 自由入力された未登録道具 | Resolve | 入力ID解決 | 未登録ならunsupported、何も持たない時はnone | P0 | UI要件 |

## 効果IDの状態遷移

`candidate -> master_confirmed -> spec_reviewed -> implemented -> fixture_verified -> game_verified`。効果が未収録なら`not_applicable`、初期試作に存在するだけなら`prototype_implemented`。

## 追加で必要な全件監査

- マスターの全技→通常威力、動的威力、参照能力例外、連続技、固定ダメージ、非ダメージに分類。
- マスターの全特性→ダメージ増減、無効、技改変、間接効果、監査済み中立へ分類。
- マスターの全持ち物→影響あり、消費条件あり、フォーム専用、監査済み中立へ分類。
- 収録がないテラスタル、Z技、ダイマックス等の効果は本作で現行使用可能か確認するまで混在させない。
