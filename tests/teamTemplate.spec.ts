import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
test("team structure downloads are explicitly empty/sample, selected 5/6 labels and percussion survive bytes; mobile fits", async ({ page }) => {
  await page.goto("./");
  await page.getByText("팀 악보 틀 · NWC 표기 확인", { exact: true }).click();
  for (const singers of ["5", "6"]) {
    await page.getByLabel("노래할 인원", { exact: true }).selectOption(singers);
    await page.getByLabel("1번 파트", { exact: true }).selectOption("countertenor");
    await page.getByLabel("2번 파트", { exact: true }).selectOption("tenor");
    for (const sample of [false, true]) {
      const waiting = page.waitForEvent("download");
      await page.getByRole("button", { name: sample ? "표기 검증 샘플 받기" : "빈 팀 악보 받기", exact: true }).click();
      const download = await waiting;
      expect(download.suggestedFilename()).toBe(`AcaScore-${singers}-${sample ? "notation-test" : "empty-team"}.nwctxt`);
      const text = await readFile((await download.path())!, "utf8");
      expect((text.match(/\|AddStaff\|/g) ?? []).length).toBe(Number(singers));
      expect(text).toContain("1. 카운터테너");
      expect(text).toContain("2. 테너");
      expect(text).toContain("|Clef|Type:Percussion");
      expect((text.match(/\|Channel:10\r/g) ?? []).length).toBe(1);
      expect((text.match(/\|Note\|/g) ?? []).length).toBe(sample ? Number(singers) * 4 : 0);
      expect(text.includes("6. 추가 보컬")).toBe(singers === "6");
    }
  }
  await expect(page.getByText(/음원 분석 결과나 자동 편곡이 아닙니다/)).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
