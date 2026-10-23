# 01 — UI・コンポーネント・状態管理

## 優先する見た目

`reference-ui/ux-design-v0.5.html`および`reference-ui/screen-design-v0.5.md`の通常画面/PC/TOP50モバイル/詳細を視覚正本とする。ただし**共有関連ボタン・メニュー・画面を削除**し、空いた領域は既存の保存/アカウント導線に合わせて整える。モック画像や架空数値は本番のデータと取り違えない。

## コンポーネント境界

- `AppShell`：モード切替、ナビ、認証/保存導線、全体エラー通知
- `NormalCalculatorPage`：攻防の型エディタ、技×最大4、共通戦闘条件、結果・攻守交換
- `Top50CalculatorPage`：攻撃側、共通条件、ランキング、PC4列/モバイル固定技タブ
- `Top50DetailSheet`：ローカル技・条件、対象個体の共通型エディタ、通常計算へ転写
- `PokemonComboBox`,`MoveComboBox`,`AbilityComboBox`,`ItemComboBox`：名称検索/候補の正規化・説明
- `StatPointEditor`,`NatureFactorEditor`,`BattleConditionsEditor`,`DamageResultDisplay`,`RemainingHpBar`：入力/表示の共通部品
- `SavedCalculationsPage`：認証後の自分のデータCRUD。`ShareActions`, `SharedPage`は禁止。

## State所有者／寿命

| データ | オーナー | 更新・破棄 |
|---|---|---|
| マスター・現在公開ランキング | 読取専用版付き取得層 | 版が変わると再取得。画面表示中の世代は固定 |
| 通常計算入力 | ProviderスコープのZustand normal slice | 同セッションで保持、明示保存のみDBへ |
| TOP50シングル/ダブル各入力 | Zustand top50 workspace | 両形式を独立保持。overrideキーは`rankingEntryId` |
| TOP50詳細の選択技・局所戦闘条件 | 詳細に属するReact local reducer | 詳細を開くたびコピー、閉じると破棄 |
| TOP50詳細で編集した防御側の型 | Zustand `defenderOverrides[rankingEntryId]` | 一覧に反映し、詳細を閉じても保持 |
| 技タブ/検索/ソート/表示モーダル | UI local state | 基本的に保存対象外 |
| 計算結果 | `DamageRequest`から導出したキャッシュ/メモ | 入力revision/版に紐付け。DBへ保存しない |

## 重要な操作契約

1. TOP50の行を開く時点で共通条件を**deep copy**する。技セルを開いた場合はそのmoveIdを詳細へコピー。
2. 詳細で技や天候を変えてもTOP50の4技・共通条件を変更しない。型編集は同じ行のoverrideへ反映。
3. `通常計算へ` は攻撃側、選択中の防御側型、形式、**詳細の技・条件**を一括コピーする。選択中の技を通常計算の先頭枠に配置し、ほかの技を保てる範囲で維持する。
4. ランキングが更新されても表示中の`rankingSnapshotId`を自動的に差し替えない。新世代へ移る際は利用者に告知し、旧overrideの暗黙移植は禁止。
5. 保存後のデータ再取得・ログイン/ログアウトでも、未保存の編集中入力を黙って消去しない。ログインしただけで自動保存しない。
6. 無効な実数値入力はドラフトに保持するが、無効なbuildをエンジンへ送らず直前の結果を新結果として表示しない。

## 実装注意

- ZustandのグローバルsingletonをSSRで共有しない。`CalculationSessionProvider`でセッションごとにStore factoryを作る。
- Server ComponentsからZustand Storeを直接読み書きしない。データ取得はNext側、入力インタラクションはClient Components。
- 性格の変更時、別能力の補正変更が生じる候補は確認UIを出す。性格名とゲームStat Alignmentの対応は正式マスター検証後。
- WCAG意識：キーボード操作、フォーカス復帰、タブ/ドロワーのARIA、HP色だけに依存しない数値表示をE2Eで確認する。
