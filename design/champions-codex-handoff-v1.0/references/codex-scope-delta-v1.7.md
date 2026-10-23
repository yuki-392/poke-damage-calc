# Codex向け変更指示：共有機能を初期実装範囲から除外

## 対象と変更内容

| 元資料 | 参照箇所の例 | v1.7適用後 |
|---|---|---|
| UI v0.5 / 画面仕様 | 共有ボタン、共有メニュー | 実装せず、残りのレイアウトを維持 |
| Reactコンポーネント v1.0 | `ShareActions`, `SharedCalculationPage`, `/shared/[token]` | 削除対象 |
| React状態管理 v1.0 | URL共有、共有スナップショット、共有復元 | 削除。保存・通常計算への転写は維持 |
| Reactテスト v1.0 | 共有テスト FE-42ほか | 初期テスト対象から削除し、共有ルート不在の否定テストへ置換 |
| API詳細 v1.0 | `/api/v1/shares` 全系列 | OpenAPI・Route Handler・テストから削除 |
| 差分解消 v1.1 | `SharedCalculationDTO`, 共有関連Schema | 削除。`SavedInputSnapshot`の構造は維持 |
| DB最終 v1.2 | `shared_calculations` とそのFK/RLS/GRANT | 初期baseline migrationから完全に除去 |
| DB/アクセステスト | 共有認可、token失効、共有保持 | 該当テストを削除。個人保存の認可・競合制御は維持 |
| 設計決定 v1.4/v1.5/v1.6 | U-03/U-04/U-05 | 初期実装についてはU-06により失効 |

## Codexに渡す際の指示

- `share`, `shared`, `shareToken`, `tokenHash`, `SHARE_EXPIRED` をアプリコード、SQL、OpenAPI、ルーティング、ナビゲーションに残さない。**ただし一般的な意味の共通コンポーネント名 `shared` ディレクトリ等は例外**。
- 保存機能の「保存した計算を別デバイスで開く」は **アカウント本人のみ**。公開URLでの共有と混同しない。
- TOP50更新時のロールバック用snapshotと、過去公開を目的とするアーカイブを区別する。外部統計データの永久保持をデフォルトにしない。
- ゲーム内TOP50と実データの一致、ソースキャッシュ利用条件・出典表示、マスターの権利確認は **共有撤回後も残る公開前ゲート**。
- 変更点を統合正本へ反映する際、旧ページ／旧SQL／旧APIの単なるコメントアウトではなく、リリース用の仕様・スキーマから削除する。

## 設計の整合性確認項目

1. UI画面一覧に`share`系ルートがない。
2. OpenAPIに`/shares`パスも`Share*` schemaもない。
3. DB ER図、baseline migration、RLS/GRANTに`shared_calculations`がない。
4. DTOと保存APIは引き続き`SavedInputSnapshot`の単一契約を使う。
5. ログインしない計算、ログイン後の個人保存・同期、TOP50詳細→通常計算への引継ぎが回帰しない。
6. 過去snapshot参照切れはユーザーに明示し、勝手に最新データで書き換えない。
