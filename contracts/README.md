# 共通契約 Phase 1

実装の正本は `src/lib/contracts/` のZodスキーマ。型は `z.infer` で導出し、`pnpm contracts:generate` で `openapi.yaml` を生成する。`pnpm contracts:check` は再生成との差分とOpenAPI参照整合を検査する。APIパスは後続実装の契約であり、このフェーズではHTTPハンドラーを提供しない。

## 境界での使用

```ts
const contracts = createContractValidator(trustedVersionedCatalog, authorizedSnapshots);
const input = parseSnapshotJson(rawJson, contracts.snapshot);
const write = contracts.calculationWrite.parse(requestBody);
```

クライアントとサーバーで同じfactoryを使う。サーバーのカタログ・snapshotはサーバー自身が信頼できる取得層からロードする。リクエストで渡された「合法性一覧」や「本人のsnapshot」を信用しない。認証/認可、RLS、権利審査、実機の証跡の真偽はこのスキーマの責務ではない。

`savedInputSnapshotSchema` / `buildSchema` は構造検証用。**単独では既知IDや合法性を保証しない**。保存・計算の境界では `createContractValidator` の検証を必須とする。parse結果は入力を複製し、schema versionは数値の1のみ許可する。未知キー・旧版・不整合を暗黙に修正/削除しない。

`parseSnapshotJson` は生JSONのUTF-8サイズを250,000バイト以下に制限してからparseする。objectに対するsnapshot検証でもJSON化後のサイズを確認する。Phase 7のRoute Handlerではストリーム受信上限も別途設け、巨大bodyを全量読み込みしない。

## 実装補足と設計差分

- `openapi-v1.2.yaml` に残る `Shares` タグとDELETEの共有snapshot説明を除去。根拠は統合仕様U-06。原本は変更しない。
- 各API envelopeはstrict。一覧の自由形式itemsを保存メタデータの明示型に具体化。If-Matchはrevisionの最小値1と整合させ、`"rev:0"`を拒否する。
- マスター契約を具体化し、収録状態、属性別provenance、合法特性、性格ベクトル、効果分類・証跡参照を保持する。本番データは未登録。証跡IDの存在チェックは証跡そのものの監査完了を意味しない。
- シングルの `targetsActuallyHit` は1、追加条件の同じ対象/種類の重複は拒否する。曖昧な競合条件の黙認を防ぐためのクロスフィールド検証。
- `currentHp` の正整数/nullは検証するが、最大HPとの比較は版付き算術が必要なためPhase 2へ分離。暫定HP式を契約層に重複実装しない。
- TOP50 overrideは参照行のフォームと一致させる。旧snapshotや別形式・順位数字への付け替えはしない。
- `Ranking`の検証は構造・ID・レギュレーション・出典の一致まで。時期/シーズンの比較可能性、実測joint distributionの証拠、P0-05承認、原子的公開はPhase 3/4の公開ゲートで追加する。スキーマに合格した未検証ランキングを正式公開してはならない。
- customText持ち物・既知だが習得外の技・未対応効果を参照する入力は保持可能。これは計算可能/合法習得の宣言ではない。Phase 2で未対応効果は数値を出さず `unsupported` とする。
- ZodのクロスフィールドrefinementをJSON Schemaだけでは表現できない。生成OpenAPIの `x-runtime-validation` と本書を併用し、API側で同じfactoryを必ず呼ぶ。

参照: `design/champions-codex-handoff-v1.0/docs/02-system-and-contracts.md`、`docs/03-master-ranking-database.md`、`contracts/shared-contract.reference.ts`。手書きの互換型コピーは作らず、型一致テストで原本と照合する。
