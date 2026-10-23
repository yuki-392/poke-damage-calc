# Codexへ貼り付ける開始指示

あなたは`Pokémon Champions`専用のダメージ計算Webアプリを実装するエンジニアです。添付した`champions-codex-handoff-v1.0`を正本として使用し、UI v0.5を可能な限り再現してください。最初に`START_HERE.md`を読み、`docs/00`〜`08`および`contracts`を確認してください。

**最初の作業**: (1)実装対象/非対象一覧、(2)レポジトリ構成案、(3)実装マイルストーン、(4)未検証のリリースブロッカー、(5)必要なサービス設定の一覧を提示し、根拠ファイルを引用してください。その後、`docs/05-build-plan.md`の順で、小さなPR/コミット単位に実装しテストしてください。

制約:

- Next.js App Router + TypeScript + Tailwind/shadcn/ui、Supabase PostgreSQL/Auth/Cron/Edge Functions、Vercel、pnpm、Vitest、Playwrightを第一候補とする。React Client ComponentsにZustand ProviderスコープのStoreを作成する。
- **共有リンク、`/api/v1/shares`、`shared_calculations`、公開ランキング履歴アーカイブを作らない。** 旧資料より本パックが優先。
- `SavedInputSnapshot={payloadSchemaVersion:1,mode,input}`は設計基準。型だけでなくランタイム検証を共通化し、ダメージ結果/UI一時Stateを保存しない。
- 状態管理: TOP50詳細の技/戦闘条件は一時ローカルState。対象ポケモンの育成型overrideは対象entryに維持。通常計算へは詳細の状態をコピー。別フォーマット間の状態混在なし。
- 公式ゲーム順位、特殊効果/端数、Champions固有のフォームとStat Alignmentは実機で未検証のものがある。推測で`verified`にしない。不明な効果は`unsupported`、条件不足は`missingContext`。曖昧な値を数値として表示しない。
- 更新処理は毎時、当日成功後の外部アクセス無し、上流revisionを確認し公開から30分以上待機。シングル/ダブルのランキング公開切替は1トランザクション。更新失敗時は旧正常版。
- データを許諾なく再配布・永続ミラーにしない。出典表示、素材利用条件とセキュリティ（Auth、RLS、secret管理）を実装。
- `references/`の古い共有機能、9:30固定スケジュール、`natureId:null`保存可、`isMega`との二重フォーム表現、レガシーmigrationは採用しない。

進め方:

1. 初回は`docs/05-build-plan.md`のPhase 0/1を着手する。DBや外部APIの鍵はユーザー/環境から与えられたもののみ使用し、コードへ直書きしない。
2. 各マイルストーンで変更ファイル、テスト結果、残る未検証事項を報告する。検証を通らなければその理由を明示する。
3. TOP50・ダメージを公開できる品質かは`docs/06-acceptance-and-release.md`に従い別判定する。検証資料のない機能はデモ/未検証表示または公開停止とする。
4. 仕様変更が必要なら、どの文書と矛盾するか示し、恣意的に製品仕様を変更しない。

UIの各表示ダメージ・ランキングは**モック値**であり、テスト期待値として使わない。先行エンジンv1.1も試作資料で、正しいゲーム計算の保証ではない。
