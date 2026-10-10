import { test, expect } from "@playwright/test";

test("top bar shows app install and QR buttons", async ({ page }) => {
  await page.goto("./");
  const topbar = page.locator("header.topbar");
  await expect(topbar.locator("[data-ys-install]")).toBeVisible();
  await topbar.getByRole("button", { name: "QR 코드로 접속" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("AcaScore AI");
  await expect(dialog).toContainText("gmlduqzhd123-lab.github.io/Acapella-maker/");
  const loaded = await dialog
    .locator("img")
    .evaluate((img: HTMLImageElement) =>
      img.decode().then(
        () => img.naturalWidth > 0,
        () => false,
      ),
    );
  expect(loaded).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});
