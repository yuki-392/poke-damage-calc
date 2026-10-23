import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export default function Home() {
  return (
    <>
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <div className="flex flex-col gap-1">
            <span className="text-lg font-bold tracking-tight">ChampionCalc</span>
            <span className="text-xs tracking-widest text-muted-foreground">UNOFFICIAL BATTLE TOOL</span>
          </div>
          <Badge variant="secondary">開発中・実機未検証</Badge>
        </div>
      </header>
      <main className="mx-auto flex max-w-6xl flex-col gap-7 px-5 py-8 sm:px-8 sm:py-12">
        <Alert>
          <AlertTitle>開発環境・共通契約の確認用</AlertTitle>
          <AlertDescription>計算機能はまだ利用できません。ランキング・認証・個人保存も準備中です。</AlertDescription>
        </Alert>
        <div className="flex flex-col gap-3">
          <p className="text-xs font-semibold tracking-widest text-primary">POKÉMON CHAMPIONS</p>
          <h1 className="text-2xl leading-snug font-bold tracking-tight sm:text-3xl">Pokémon Champions ダメージ計算</h1>
          <p className="max-w-2xl text-sm leading-7 text-muted-foreground">通常計算とTOP50まとめ計算を、同じ計算エンジンで比較できるアプリを開発しています。</p>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle><h2>通常ダメージ計算</h2></CardTitle>
              <CardDescription>攻撃側と防御側を指定し、最大4技を比較。</CardDescription>
            </CardHeader>
            <CardContent><p className="text-sm leading-7">計算エンジンとマスターの検証後に利用できます。現在はダメージ数値を表示していません。</p></CardContent>
            <CardFooter><Badge variant="outline">準備中</Badge></CardFooter>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle><h2>TOP50まとめ計算</h2></CardTitle>
              <CardDescription>シングル・ダブルそれぞれ、最大50匹×4技を比較。</CardDescription>
            </CardHeader>
            <CardContent><p className="text-sm leading-7">ゲーム内の順位との照合が必要です。現在はランキングを掲載していません。</p></CardContent>
            <CardFooter><Badge variant="outline">準備中</Badge></CardFooter>
          </Card>
        </div>
        <Card>
          <CardHeader>
            <CardTitle><h2>公開に向けた検証状況</h2></CardTitle>
            <CardDescription>自動テストの合格と、ゲーム本体との一致は別の検証です。</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex list-inside list-disc flex-col gap-3 text-sm leading-6">
              <li>P0-04：収録データ・性格・利用条件の確認 — 未完了</li>
              <li>P0-05：ゲーム内TOP50順位の照合 — 未実施</li>
              <li>P0-06：ダメージ計算結果の実機照合 — 未実施</li>
            </ul>
          </CardContent>
        </Card>
        <footer className="text-xs leading-6 text-muted-foreground">Pokémon Champions向けの非公式ツールです。開発中のため、ゲームの結果や順位の正確性を保証するものではありません。</footer>
      </main>
    </>
  );
}
