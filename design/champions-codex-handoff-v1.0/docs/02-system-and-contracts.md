# 02 — 技術構成とAPI/保存契約

## 技術選定

Next.js App Router + TypeScript、Tailwind/shadcn/ui、Zustand（Provider scope）、Supabase Auth/PostgreSQL/RLS/Cron/Edge Functions、Vercel、pnpm、Vitest、Playwright。計算コアはブラウザから呼ぶ純粋なTypeScriptライブラリ。Backendでダメージ200組を逐一計算する構造にはしない。

```text
Browser (React Client, common damage core)
  ├─ versioned catalog + active rankings (read-only)
  └─ authenticated saved calculations CRUD
Next.js Route Handlers
  ├─ verify Supabase session, runtime-validate DTOs, check owner/revision
  └─ read sanitized public catalog/rankings from Supabase
Supabase PostgreSQL (RLS, versioned catalogs, atomic publication)
Supabase Cron (hourly) -> secured Edge Function -> source check -> stage -> verify -> publish pair
```

## 公開API（初期MVP）

| Endpoint | 認証 | 目的 |
|---|---|---|
| `GET /api/v1/bootstrap` | 不要 | 活性public版とクライアント互換性 |
| `GET /api/v1/catalog/{kind}` | 不要 | 公開/検証済みの版付きマスター（kind=forms,moves,abilities,items,learnsets,natures） |
| `GET /api/v1/rankings/active` | 不要 | 現在の1公開世代: singles+doubles合計100行 |
| `GET /api/v1/rankings/snapshots/{snapshotId}` | 条件付き | active版または認証本人の保存データが参照する短期保持版に限定。無制限履歴API禁止 |
| `GET/POST /api/v1/calculations` | 必須 | 自分の保存一覧/新規作成 |
| `GET/PUT/DELETE /api/v1/calculations/{id}` | 必須 | 自分の1件取得/改訂/削除 |

`/api/v1/shares*`と公開閲覧用`/share/*`の実装は禁止。公開ランキングを外部APIダンプの代替にしない。統計API利用条件に合わせレスポンス量、rate limit、キャッシュを調整。

## 保存DTOの唯一のwire形式

```ts
SavedInputSnapshot =
  | { payloadSchemaVersion: 1; mode: 'normal'; input: NormalSavedInput }
  | { payloadSchemaVersion: 1; mode: 'top50'; input: Top50SavedInput };
```

`input`には`format`, `attacker`, `moves`, `conditions`, `sourceVersions`と、normalなら`defender`、top50なら`rankingSnapshotId`, `defenderOverrides`。ユーザー編集中の無効文字列・タブ選択・ローカル詳細条件・ダメージ値は保存しない。

- `Build`にはフォームID、6能力ポイント、**必須の合法性格ID**、性格補正の5値、適法な特性、3態持ち物（なし/登録済み/自由テキスト）、HP、ランク、状態異常、型の由来。フォームの正本は`pokemonFormId`（戦闘中のメガ等を含む識別子）とし、旧`isMega`重複booleanはwireから削除。メガの合法性・前後フォームIDはマスター検証で判定する。
- `sourceVersions`: `ruleVersion`, `masterDataVersion`, `effectCatalogVersion`, `regulationId`。UI/サーバー/エンジンで同じ意味とする。
- `rankingSnapshotId`は片形式のスナップショット、`publicationId`は両形式の同時公開版。overrideキーはスナップショット行の`rankingEntryId`、順位数字ではない。
- `targetsActuallyHit`は範囲補正の適用判断用。ダブルであるだけで0.75倍にしない。`currentHp:null`は原則満タン扱いだがHP依存技の必要条件が不明なら`missingContext`を返す。

## 入力・API保護

- ランタイム検証をクライアント/サーバーで共有（例：Zod）。TypeScript型だけでは不十分。1能力0..32、総和66以下、ランク−6..+6、合法性格と補正一致、合法特性、既知ID、UTF-8総容量上限（保存payloadの設計上限250,000バイト）を検証。
- 保存は本人が明示実行したときのみ。認証はGoogle OAuthかパスワード不要メール認証リンク。ログイン後も未保存入力を保持。
- 保存更新は`revision`で楽観ロックし、競合409時はユーザーに選択を求める。403/404を使い他人のデータを漏らさない。
- Supabase service role鍵をブラウザへ絶対に配布しない。Route Handlersでsession検証、DBではRLS＋GRANT。Auth cookie処理は公式推奨の安全な実装に従う。
- 取得データの欠落/過去snapshot削除/版不一致を現在ランキングへ無言で差し替えない。理由と「最新へ切り替える」明示操作を示す。

`contracts/openapi-v1.2.yaml`と`contracts/shared-contract.reference.ts`は**最終設計例**。詳細に追加変更する場合、両者とランタイムschemaが一致するよう更新する。
