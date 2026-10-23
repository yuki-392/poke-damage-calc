# P0-05: TOP50ランキング正確性 検証レポート v1.0

記録日: 2026-10-23 (JST)。対象: UI v0.5、API/DB統合設計、U-06共有機能廃止。

## 結論

**ステータス: PARTIAL / GAME-INTERNAL UNVERIFIED**

- メイン候補の `data/builder/meta-singles.json` / `meta-doubles.json` に各262行、両形式とも先頭50位の連続順位が存在することを2026-10-23に確認。前段 v1.1で推定型の構造、能力ポイント境界も確認済み。
- 10月23日取得の補助候補と比較した場合、先頭50位に含まれるポケモン名の共通数はSingles 47/50、Doubles 46/50。**一致する順位**はそれぞれ4、5件。これは互いの情報源・観測日・集計方法が違う比較であり、どちらの正確性も判定できない。
- メインの `generatedAt` は公開JSONの生成時刻で、**ゲーム内で順位を確認した時刻**と同一とは限らない。`meta-*.json` 自体にはseason/regulationが明示されていないため、別の信頼できるメタデータと突合が必要。
- 補助候補Singlesの出自はMunchStatsのゲーム内キャプチャと開発者が説明。DoublesはPikalyticsの *Showdown battle-usage* 系であり、Championsのゲーム内順位として独立検証には使えない。
- MunchStats自身はゲーム画面を直接読み取り、両形式を夜間取得すると説明している。一方で今回ブラウザーで確認できたDoubles個別ページには**2026-10-06 12:07 UTC**という取得日時が表示され、今回の10月22/23日データと同時点ではない。したがってゲーム内の順位一致の全件証明には使用しない。
- 別サイトPokestはゲーム内ランキング画面から運営者が集計したと説明しているが、確認できるTOP6は**10月12日取得**で、最新のメイン候補とは観測日が違う。ChampionsDex/PokéChamp DB等の似た順位表も第三者であり、源泉が独立しているか確認できない限り「ゲーム画面での検証」には数えない。
- 公式のシーズン告知は、2026年10月7日開始〜11月4日終了のM-7、レギュレーションM-Cを確認できる。これと候補データの出典シーズンを照合してから採用判断する。

## 検証したソース

| ソース | 形式 | 観測したデータ時刻(UTC) | 件数 | 源泉 | 用途 |
|---|---|---|---:|---|---|
| Gheist23 Battle Data (`meta-singles`) | Singles | 2026-10-22 08:44:17 | 262 | CSV由来の`column_position`; ゲーム画面由来の独立検証未完 | 主採用候補 |
| Gheist23 Battle Data (`meta-doubles`) | Doubles | 2026-10-22 08:44:17 | 262 | 同上 | 主採用候補 |
| eurekaffeine Battle Meta (`singles`) | Singles | 2026-10-23 07:46:09 | 257 | 開発者説明ではMunchStatsゲーム内画面取得 | 参考比較 |
| eurekaffeine Battle Meta (`doubles`) | Doubles | 2026-10-23 06:55:19 | 289 | Pikalytics Showdown使用率、`season.data_date=2026-09` | **ゲーム内順位検証に使用禁止** |

*注意: 生成・公開のタイムスタンプは、そのソースのゲーム内キャプチャ日時とは同義ではない。開発者主張は第三者自己申告であり、当プロジェクトによる実機監査とは別。*

## 同順位・共通数比較

| 比較 | TOP50双方に登場 | 同順位 | 共通ポケモンの平均順位差絶対値 | 解釈 |
|---|---:|---:|---:|---|
| メイン vs 補助 Singles | 47/50 | 4 | 約5.64位 | 別観測時点・データ処理の差が大きい |
| メイン vs 補助 Doubles | 46/50 | 5 | 約5.15位 | Showdownとゲーム内順位は別物。正誤比較に不適 |

英語の `name` を使った暫定照合。フォルムIDの完全な照合は未実施のため、採用判定にこの数値を流用してはいけない。

### 順位差の例（同時点のゲーム実機対照ではない）

| ポケモン | メインSingles | 補助Singles | メインDoubles | 補助Doubles |
|---|---:|---:|---:|---:|
| Garchomp | 1 | 1 | 1 | 10 |
| Primarina | 2 | 3 | 37 | 42 |
| Mimikyu | 3 | 10 | - | - |
| Rillaboom | 19 | 11 | 3 | 1 |
| Sneasler | 25 | 16 | 2 | 2 |

`-`は一覧の50位以内に存在しないことを表す。例は原因究明用であり、外部結果を公式ランキングと称する根拠ではない。

## TOP50採用判断

- **JSONの技術的検証**: PASS（順位1〜50連番・件数・項目構造。前回v1.1と今回の取得を合わせて確認）。
- **源泉の種別判定**: PARTIAL（補助Doublesは異なる統計、メインのゲーム内データ収集過程の独立証跡未確認）。
- **シーズンと観測時刻の一致**: FAIL/UNKNOWN（メインJSONに規制版情報なし、補助Doublesは別期データ）。
- **実機TOP50と完全同順位**: NOT TESTED（スクリーンショット/同日全件記録が未入手）。
- **フォーム識別**: NOT TESTED（IDマッピングと全100枠の実機照合未実施）。
- **提供元APIの利用条件**: 利用規約はWebツール利用を許可・出典表示必須・単独配布と恒久ミラーを制限（詳細はP0-04/U-06の権利監査を参照）。

## 参照資料

- メイン静的JSON: https://github.com/Gheist23/pokemonbattledata/blob/main/data/builder/meta-singles.json ; https://github.com/Gheist23/pokemonbattledata/blob/main/data/builder/meta-doubles.json
- メイン変換処理: https://github.com/Gheist23/pokemonbattledata/blob/main/tools/builder-meta.mjs
- メインAPI説明: https://championsbattledata.com/api_guide
- 提供元規約: https://championsbattledata.com/api-rules/
- 補助ソースの集計説明: https://github.com/eurekaffeine/pokemon-champions-scraper/blob/main/README.md
- MunchStatsゲーム内取得説明: https://www.munchstats.com/about/
- MunchStats（古い観測時点の一例）: https://www.munchstats.com/champions/doubles/Garchomp
- Pokestの手動ゲーム画面由来順位: https://pokest.com/en
- シーズンM-7公式告知: https://news.pokemon-home.com/ja/page/845.html
