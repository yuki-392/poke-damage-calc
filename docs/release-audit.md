# 公開監査台帳

更新日: 2026-10-24。アプリは開発中。設計はdesign_ready。全機能のimplementation_ready / release_readyには未到達。

| ID | 条件 | 状態 | 証跡・次の担当作業 |
|---|---|---|---|
| P0-04 | 収録フォーム・技・特性・性格/Stat Alignment・マスター合法性 | 実データ構造を部分監査・意味整合/実機未検証 | APIと候補マスターにフォーム/特性不足と収録フラグ矛盾。docs/validation/phase-0-1-external-data.json。承認なしに本番データへ昇格しない |
| P0-05 | 同レギュレーションのゲーム内TOP50×2のフォームと順位全件一致 | 未実施・公開阻止 | 原本references/in-game-rank-audit-template.csv（100行）に画面・日時・シーズン証跡を記録 |
| P0-06 | 採用演算と複合条件・丸め境界の実機整数ダメージ一致 | 未実施・公開阻止 | 原本references/verification-cases.csv（47件）を起点にL3証跡を採録 |
| RIGHTS | 採用データの最新規約・帰属・加工表示・画像/IP許諾 | 未審査・公開阻止 | Phase 4/8。現状で外部ゲームデータや画像の配信なし |
| API-03 | 保存DTOの実行時・版・ID・性格・snapshot整合 | Phase 1実装 | tests/contracts.test.ts。DBとAPI実装の認可試験は後続 |
| SCOPE-01 | 共有URL/API/DBなし | Phase 0/1で検査 | tests/openapi.test.ts / e2e/foundation.spec.ts |
| SEC | 実DB RLS/GRANT・session・CSRF・リダイレクト・secret非露出 | ローカル基盤プローブ成功・製品の試験は未実施 | 一時テーブルのRLS/制約とローカルAuthリンク/失効は確認。アプリ用DB/RLS/認証・保存APIはPhase 3/7/8で検査 |
| OPS | 毎時・30分待機・当日成功後外部確認停止・公開原子性・旧版保持 | 未実装 | Phase 3/4/8。クラウドCronは未設定 |
| UX | v0.5 PC/スマホ・キーボード・詳細state・スクリーンリーダー | 本画面未実装 | Phase 5/6。今回のsmokeは案内ページのみ |
| PERF | 200組計算・入力応答・端末条件付き3秒目標 | 未実施 | Phase 6/8。ハードウェア・ブラウザを記録 |
| UX-PROB | 確率表示の切り捨て/四捨五入の最終受入 | 未確定 | Phase 5受入時。内部精度とは分離 |

自動テスト合格、他ライブラリとの一致、実機一致は別の証拠。P0-05/P0-06の資料がない限り、正確性を公称した正式公開は行わない。本番デプロイ・課金設定はユーザー承認が必要。
