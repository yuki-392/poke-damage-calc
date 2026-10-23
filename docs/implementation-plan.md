# 実装計画・初回スコープ

2026-10-23。作業開始時のリポジトリは空。設計原本は `design/champions-codex-handoff-v1.0/` に展開して保存する。

## 正本と優先順位

ユーザーの今回の指示 → START_HERE.md / docs/00〜08 の統合仕様 → contracts/ の設計例 → reference-ui/ のv0.5視覚仕様 → references/ の詳細資料。原本は変更せず、実装上の補足を本ディレクトリに記録する。

## 対象と非対象

- 今回: Phase 0（Next.js App Router、TypeScript、pnpm、Tailwind、shadcn/ui基盤、Vitest、Playwright、CI、env例、監査台帳）とPhase 1（マスター契約、フォーム・性格の照合、保存DTO、APIの実行時検証）。
- 後続: 共通計算コア → DB/RLS → データ取得・毎時更新 → 通常UI → TOP50 UI → Auth/Save → 最終QA。
- 作らない: 共有URL・共有API/DB、ランキング公開履歴アーカイブ、旧版の暗黙移植。モック順位・ダメージの配信もしない。
- 今回の画面は開発状態の案内のみ。完成UIの実装はPhase 5/6でv0.5に合わせる。

根拠: 原本 `docs/00-product-requirements.md`、`docs/01-ui-and-state.md`、`docs/05-build-plan.md`。

## 構成

```text
src/app/                  App Router・開発状態ページ
src/components/ui/        shadcn/ui
src/lib/contracts/        Zodを正本とした共通型・ランタイム検証
contracts/                生成OpenAPI・契約の補足
tests/                    架空の契約fixture・単体テスト
e2e/                      Playwright smoke
scripts/                  契約生成・整合性チェック
supabase/                 ローカル設定（DB baselineはPhase 3）
docs/                     計画・実装記録・監査台帳
design/                   ZIP原本（実装コードから参照しない）
.github/workflows/         lint / typecheck / tests / build / E2E
```

## マイルストーン

0. 起動・検証コマンドとCIを整備。鍵がなくても起動できる。
1. strict DTO、6能力0〜32・合計66、合法な単一性格ベクトル、版付きID/特性照合、UTF-8 250,000バイト制限、TOP50 snapshot/format/entry対応をテスト先行で実装。型はZodから導出し、OpenAPIも生成する。
2. 唯一の純粋計算口と結果の判別union、整数・乱数・KO分布、未対応判定。
3. 新規baseline、RLS/GRANT、原子的ランキング公開、個人保存。
4. 権利監査・正規化、毎時確認、30分待機、当日更新成功後の外部アクセス停止。
5–7. v0.5の通常/TOP50、Providerスコープの状態管理、Google/Magic Link・保存同期。
8. 実機証跡、権利、セキュリティ、性能の公開判定。

根拠: 原本 `docs/02-system-and-contracts.md`〜`docs/06-acceptance-and-release.md`。

## サービス設定と公開ブロッカー

- Supabase: 開発用URL/publishable key、後続でGoogle OAuth・メール送信・redirect allowlist・DB/RLS・Cron/Edge Functionのsecretが必要。今回クラウドプロジェクトを作成/変更しない。
- Vercel: Phase 8以降に環境変数とデプロイ承認が必要。本番公開や課金設定は行わない。
- データ源: 採用版、規約、帰属、再利用・画像の許諾を個別確認する。現時点で本番マスターはない。
- P0-04: フォーム/性格/Stat Alignmentと収録・権利は未検証。
- P0-05: ゲーム内TOP50×2の順位照合は未実施。
- P0-06: 計算の整数値・丸め・複合条件の実機照合は未実施。
- 自動テスト成功はゲーム本体との一致や公開承認を意味しない。

根拠: 原本 `docs/03-master-ranking-database.md`、`docs/06-acceptance-and-release.md`、`docs/07-open-risks-and-decisions.md`。
