import { expect, test } from "@playwright/test";

test("Phase 0: anonymous shell clearly identifies unavailable features", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Pokémon Champions ダメージ計算");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("計算機能はまだ利用できません");
  await expect(page.getByText("P0-05：ゲーム内TOP50順位の照合 — 未実施")).toBeVisible();
  await expect(page.getByRole("link", { name: /共有/ })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("foundation.png"), fullPage: true });
});

test("SCOPE-01: sharing endpoints are absent", async ({ request }) => {
  for (const path of ["/share/example", "/api/v1/shares", "/api/v1/shares/example"]) {
    expect((await request.get(path)).status()).toBe(404);
  }
});
