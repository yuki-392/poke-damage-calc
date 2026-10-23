import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ChampionCalc — 開発中",
  description: "Pokémon Champions専用ダメージ計算アプリ。開発中・実機未検証。",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ja"><body>{children}</body></html>;
}
