# ADR-0002: 検証専用に @smogon/calc 0.12.0 を固定する

日付: 2026-10-24。状態: 採用（L2検証用途のみ）。

設計P0-06 §3に従い、独立TSコアの比較先として `@smogon/calc@0.12.0` をdevDependencyへ追加する。npmのgitHeadは `d7a69cf40616057ef40faf7623df7a628e58b535`。pnpm lockfileのintegrityで配布物を固定する。

[公式calc.ts](https://github.com/smogon/damage-calc/blob/d7a69cf40616057ef40faf7623df7a628e58b535/calc/src/calc.ts) とインストール済み配布物の両方で、generation 0が専用 `calculateChampions` を呼ぶことを確認した。gen9代用はしない。[公式stats.ts](https://github.com/smogon/damage-calc/blob/d7a69cf40616057ef40faf7623df7a628e58b535/calc/src/stats.ts) のChampions用能力値式とEV欄がポイントを受け取る経路も確認した。

候補のうち、専用経路とソースを固定できる公式パッケージを採用する。同じパッケージを使う外部計算サイトは、さらに独立した数式実装としては数えない。今回の目的は限定条件の算術照合であり、全技・特性・持ち物・新フォームの対応を保証しない。

ライセンスはMIT。原文と著作権表示を `THIRD_PARTY_NOTICES.md` に保存した。アプリからのimportは追加せず、実装エンジンの置換もしない。したがって実行性能/採用エンジンとしての性能比較は未実施であり、製品採用を判断する際の残項目とする。

影響: 開発依存と再実行可能な比較コマンドが増える。L2一致によるproduction許可・L3昇格は行わない。
