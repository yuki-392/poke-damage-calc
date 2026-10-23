# データ利用条件と出典表示の設計 v1.0

本書はサイトに表示された規約・ライセンスの整理であり、著作権・商標権についての法律意見ではない。

## 1. 出典別の確認結果

| 出典 | 公開文書の内容 | 設計上許容する用途 | 未解決・禁止事項 |
|---|---|---|---|
| `otterlyclueless/pokemon-champions-data` | リポジトリに**CC BY 4.0**明記。出典表示、ライセンスへのリンク、改変表示が条件 | 許諾範囲内で構造化値を取り込むための候補 | 上流Showdownやゲーム由来の内容すべての第三者権利を保証するわけではない。収録網羅性・正確性は別問題 |
| PokéAPI | APIは公開・教育目的のFair Use方針。要求時のローカルキャッシュを求める。GitHubのソースはBSD-3-Clause | 名称等の補助、キャッシュ付き取得 | ソフトウェアライセンスを画像・ゲームIPの許可と同一視しない。過度な大量リクエストを回避 |
| Pokémon Champions Battle Data | API Rulesでツール利用・商用利用・合理的キャッシュを許可し、出典表示要求。独立データ配布/恒久ミラーは禁止。Site Licenseにも権利帰属を記載 | ランキングと一部メタデータをアプリ内で利用、出典表示、短期・必要なキャッシュ | 全件アーカイブ、代替公開API、画像/ゲーム商標の再利用権利は得られない |
| `Seancheey/PokeDD` | リポジトリのREADMEはMIT。PokeAPI / Smogonをデータ源にすると説明 | 対応ロジック・差分の参照、必要に応じライセンス遵守でコードの参考 | そこに含まれる素材/データが一律にMITで再配布可能とは判断しない |
| Championspedia | データ抽出元・差分等の説明は確認。公開したデータ全量のAPI再利用ライセンスは今回未確認 | 手動の独立した妥当性確認、公開内容にリンク | 未許諾の自動スクレイピング、丸ごとコピー、独自のミラー化は禁止する設計 |
| Pokémon Showdown | シミュレーターのソースコードはMIT | 一般的な計算・名称・相性の照合候補 | Champions専用データやポケモンIPの許諾とは別 |

## 2. アプリ内の出典UI

- `データ提供`/`データ出典`ページを設け、利用している出典名・リンク・適用バージョン・必要なライセンスURLを一覧表示。
- CC BY 4.0に基づくものは、クレジット、ライセンスリンク、当アプリでの加工（Championsの合法性確認や日本語名の補完等）を明記する。
- Battle Data採用時は見える場所に「Battle data provided by Pokémon Champions Battle Data」と https://championsbattledata.com/ へのリンクを置く。
- 非公式サービスであることを明示し、公式ロゴ・画像をライセンスなしでアプリ内へ埋め込まない。
- 出典を混ぜたフィールド（名称だけPokeAPI、タイプはCC BY等）は内部の`fieldProvenance`で出典を区別し、帰属漏れを監査する。

## 3. 公開前ゲート

1. 実際に採用したスナップショット/リビジョンに対する利用条件を再確認する。
2. 画像・テキスト・アイコン・長文説明を使う場合は、その**素材ごと**の権利根拠を記録する。許可が不明なら独自制作の文字UIを使う。
3. 最新TOP50統計の公開用途・キャッシュ期間がAPI Rulesに収まることを確認する（旧履歴共有はU-06で削除済み）。
4. 出典ページで必要な帰属表示・改変表示をテストする。
5. 将来のソース規約変更で利用不可となった場合、対象の自動取り込み・公開更新を停止できること。

## 4. 参照URL

- https://github.com/otterlyclueless/pokemon-champions-data/blob/main/LICENSE
- https://pokeapi.co/docs/v2
- https://github.com/PokeAPI/pokeapi/blob/master/LICENSE.md
- https://championsbattledata.com/api-rules/
- https://championsbattledata.com/license
- https://github.com/Seancheey/PokeDD
- https://thechampionspedia.com/about
- https://github.com/smogon/pokemon-showdown/blob/master/README.md
