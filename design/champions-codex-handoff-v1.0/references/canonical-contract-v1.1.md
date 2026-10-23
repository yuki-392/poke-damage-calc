# 共通DTO正本 v1.1 — Frontend / API / DB / Engine 境界

日付: 2026-10-23 / status: **technical contract reconciled** / 参照: `../contracts/shared-contract.reference.ts`、`../contracts/openapi-v1.1.yaml`

## 契約の単一化（P0-02）

- 共有・保存の wire format は `{ payloadSchemaVersion: 1, mode: 'normal'|'top50', input }`。フロント旧`schemaVersion:string`は**廃止**。
- `sourceVersions` は `ruleVersion`, `masterDataVersion`, `effectCatalogVersion`, `regulationId` **のみ**。ペイロードのschema versionを重複格納しない。
- `ValidatedPokemonBuild` に、フォームID、**全6能力ポイント**、5能力の性格倍率、性格ID（null可）、適法な特性ID、3態の持ち物、メガ状態、現在HP、5能力のランク、状態異常、型出典を保持。
- `BattleContext` は `weather`, `terrain`, `targetsActuallyHit`, `critical`, `helpingHand`, `reflectOnDefenderSide`, `lightScreenOnDefenderSide`, `auroraVeilOnDefenderSide`, `attackerGrounded`, `defenderGrounded`, `supplementary` に**型付きで統一**。旧APIの `flags:string[]`/`extra:Record<string,unknown>` は廃止。
- `normal`は攻撃側と防御側を各1つ、`top50`は攻撃側1つ、参照 `rankingSnapshotId` とentryIdをキーとするdefenderOverridesを保持。
- `BuildOrigin` は内部で`measured|estimated|custom|manual|incomplete`。ランキングサーバーからの`buildOrigin`は`measured|estimated|incomplete`に限定。
- transient fields: `validity`, `detailSessionId`, フィルター、タブ、スクロール、計算結果は**絶対に保存しない**。
- `rankingSnapshotId` はsinglesかdoublesの**一方**の不変snapshotを指す。2形式原子公開の単位は `publicationId`。明示的な新ランキングへの乗り換え以外で勝手に書き換えない。

## 変換境界

`Zustand EditorDraft -> normalize -> runtimeValidate(SavedInputSnapshot) -> Next.js Route Handler -> validateAgain -> saved_calculations.calculation_payload / shared_calculations.share_payload -> revalidateOnRead -> EditorDraft / EngineInput adapter`。

- クライアント/サーバー双方で同一**ランタイム検証スキーマ**を利用する（実装手段はZod等）。TS定義はそのスキーマから導出する。**本ファイルと参考TSだけでは実行時検証を満たさない**。
- 移行時に未知キーや不一致を黙って切り捨てない。バージョン違いは `VERSION_INCOMPATIBLE`。無効なdraftは保存/共有不可。
- UIの持ち物自由入力は保存可能。未解決効果を計算する場合は `unsupported` とする。
- `currentHp:null` は未指定/満タンとして扱う規約の候補。HP依存技・発動条件に必要な値が曖昧なら`missingContext`を優先。計算エンジンと受け入れテストで確定する。
- `isMega`とフォームIDの二重表現（P1-03）、性格倍率の合法性とユーザー操作（U-01）は**未決定**。現在の参考型は旧UIの情報を欠落なく転送する暫定形であり、合法性を保証しない。

## Runtime constraints / acceptance

- `statPoints`: 各0..32整数、総和≤66；`stages`: -6..6整数、必須5キー。
- `moves`: 既知の技IDを1..4件。利用可能技の範囲は収録マスターに依存。習得可否は表示候補条件であって、文字入力した既知技の計算自体を妨げない。
- `natureFactors`: 5キーすべて0.9 / 1 / 1.1、合法な性格ベクトルかはU-01確定後の検証規則で判定。
- `supplementary`: 判別可能な列挙値。未認識の種類は弾く。演算用の恣意的な倍率数値を受け取らない。
- メガフォームとisMegaの矛盾は受け入れ禁止（P1-03ルール確定待ち）。
- `sourceVersions`は読み込める版でなければ`VERSION_INCOMPATIBLE`。古いランキングがない場合に現在版へ黙って差し替えない。
- DBのJSONBには**ペイロードのみ**格納し、`payload_schema_version`と`mode`列はJSON内と一致することをDB/サーバーで検証。 revisionはサーバー管理。
- API contract OpenAPI 3.1 は `oneOf` でnormal/top50を区別し、追加キーは原則禁止する。さらにこの文書に記載するクロスフィールド制約はランタイム検証を必須とする。
