import { test, expect } from "@playwright/test";
import type { Page, Locator } from "@playwright/test";
import { pitchTrack, pcmWav } from "./musicSignals";

test.use({ hasTouch: true, actionTimeout: 15_000 });
async function bpm(page: Page, value: number) {
  await page.getByRole("button", { name: "BPM 수정", exact: true }).click();
  await page.getByLabel("사용할 BPM", { exact: true }).fill(String(value));
  await page.getByRole("button", { name: "BPM 적용", exact: true }).click();
}
async function values(page: Page) {
  return page.locator(".pr-note").evaluateAll((elements) =>
    elements.map((element) => ({
      id: element.getAttribute("data-note-id"),
      midi: element.getAttribute("data-midi"),
      start: element.getAttribute("data-start"),
      duration: element.getAttribute("data-duration"),
    })),
  );
}
async function drag(
  page: Page,
  note: Locator,
  dx: number,
  edge?: "left" | "right",
) {
  await note.scrollIntoViewIfNeeded();
  const box = (await note.boundingBox())!;
  const x =
    edge === "left"
      ? box.x + 2
      : edge === "right"
        ? box.x + box.width - 2
        : box.x + box.width / 2;
  await page.mouse.move(x, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(x + dx, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
}

test("actual Basic Pitch WAV → quantization preview/cancel/stale protection/apply/one undo, pickup/meter/snap/mobile", async ({
  page,
}) => {
  test.setTimeout(360_000);
  const external: string[] = [];
  page.on("request", (request) => {
    if (
      request.url().startsWith("http") &&
      (new URL(request.url()).origin !==
        new URL(process.env.TEST_BASE_URL ?? "http://127.0.0.1:4173").origin ||
        request.method() !== "GET")
    )
      external.push(request.url());
  });
  await page.goto("./");
  await page.getByLabel("음악 파일 선택", { exact: true }).setInputFiles({
    name: "quantization-real.wav",
    mimeType: "audio/wav",
    buffer: pcmWav(pitchTrack()),
  });
  await page
    .getByRole("button", { name: "음악 분석 시작", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText("음악 분석 완료", {
    timeout: 160_000,
  });
  await page.getByRole("tab", { name: "Piano Roll", exact: true }).click();
  await page.setViewportSize({ width: 2200, height: 1400 });
  await page.getByRole("button", { name: "전체 보기", exact: true }).click();
  await expect(page.locator(".pr-note")).toHaveCount(5);
  for (const pitch of [60, 64, 67, 72])
    await expect(
      page.locator(`.pr-note[data-midi="${pitch}"]`).first(),
    ).toBeVisible();
  const preview = page.getByRole("button", {
    name: "Quantization 미리보기",
    exact: true,
  });
  const apply = page.getByRole("button", {
    name: "Quantization 적용",
    exact: true,
  });
  const undo = page.getByRole("button", { name: "↶ 실행 취소", exact: true });
  const redo = page.getByRole("button", { name: "↷ 다시 실행", exact: true });
  await expect(preview).toBeDisabled();
  await expect(
    page.getByText(
      "박자를 찾지 못했습니다. BPM을 직접 입력한 뒤 다시 시도해 주세요.",
      { exact: true },
    ),
  ).toBeVisible();
  await bpm(page, 120);
  await expect(page.getByLabel("Snap", { exact: true })).toHaveValue("off");
  await page.getByLabel("1마디 1박 위치", { exact: true }).fill("1");
  const original = await values(page);
  await preview.click();
  await expect(page.locator(".pr-ghost")).toHaveCount(5);
  expect(await values(page)).toEqual(original);
  const targets = await page.locator(".pr-ghost").evaluateAll((elements) =>
    elements.map((element) => ({
      id: element.getAttribute("data-source-id"),
      tick: Number(element.getAttribute("data-start-tick")),
      length: Number(element.getAttribute("data-duration-ticks")),
      measure: Number(element.getAttribute("data-measure")),
    })),
  );
  expect(targets[0].tick).toBeLessThan(0);
  expect(targets[0].measure).toBe(0);
  console.log(
    JSON.stringify({
      actualPitchQuantization: true,
      notes: original.length,
      original,
      targets,
    }),
  );
  await page.screenshot({
    path: "test-results/quantization-preview.png",
    fullPage: true,
  });
  for (const note of targets) {
    expect(note.tick % 240).toBeCloseTo(0);
    expect(note.length % 240).toBeCloseTo(0);
  }
  await page
    .getByRole("button", { name: "미리보기 취소", exact: true })
    .click();
  await expect(page.locator(".pr-ghost")).toHaveCount(0);
  expect(await values(page)).toEqual(original);
  await preview.click();
  await bpm(page, 111);
  await expect(apply).toBeDisabled();
  await expect(page.locator(".pr-ghost")).toHaveCount(0);
  await bpm(page, 120);
  for (const [label, value] of [
    ["박자표", "3/4"],
    ["최소 단위", "eighth"],
    ["Quantization 강도", "weak"],
  ]) {
    await preview.click();
    await page.getByLabel(label, { exact: true }).selectOption(value);
    await expect(apply).toBeDisabled();
    await expect(page.locator(".pr-ghost")).toHaveCount(0);
  }
  await page.getByLabel("박자표", { exact: true }).selectOption("4/4");
  await page.getByLabel("최소 단위", { exact: true }).selectOption("sixteenth");
  await page
    .getByLabel("Quantization 강도", { exact: true })
    .selectOption("standard");
  await preview.click();
  await page.getByRole("button", { name: "+10ms", exact: true }).click();
  await expect(apply).toBeDisabled();
  await page.getByLabel("1마디 1박 위치", { exact: true }).fill("1");
  await preview.click();
  await expect(undo).toBeDisabled();
  await apply.click();
  const quantized = await values(page);
  expect(quantized).not.toEqual(original);
  expect(quantized.map((n) => n.id)).toEqual(original.map((n) => n.id));
  for (const note of quantized) {
    const target = targets.find((n) => n.id === note.id)!;
    expect(Number(note.start)).toBeCloseTo(1 + target.tick / 1920, 8);
    expect(Number(note.duration)).toBeCloseTo(target.length / 1920, 8);
  }
  await undo.click();
  expect(await values(page)).toEqual(original);
  await expect(undo).toBeDisabled();
  await redo.click();
  expect(await values(page)).toEqual(quantized);
  await expect(page.getByTestId("quant-result")).toContainText(
    "박자 정리 적용됨",
  );
  const first = page.locator(`[data-note-id="${original[0].id}"]`);
  await preview.click();
  await first.click();
  await page.getByLabel("시작 (초)", { exact: true }).fill("0.413");
  await expect(apply).toBeDisabled();
  await expect(page.locator(".pr-ghost")).toHaveCount(0);
  await undo.click();
  const zoom = await page
    .locator(".pr-grid")
    .evaluate((el: HTMLElement) => parseFloat(el.style.width) / 10);
  await drag(page, first, zoom * 0.371);
  expect(Number(await first.getAttribute("data-start"))).toBeCloseTo(
    Number(quantized[0].start) + 0.371,
    2,
  );
  await undo.click();
  await page.getByLabel("Snap", { exact: true }).selectOption("sixteenth");
  await drag(page, first, zoom * 0.371);
  const snappedStart = Number(await first.getAttribute("data-start"));
  expect(((snappedStart - 1) * 1920) % 240).toBeCloseTo(0);
  await drag(page, first, zoom * 0.2, "right");
  const snappedEnd =
    Number(await first.getAttribute("data-start")) +
    Number(await first.getAttribute("data-duration"));
  expect(((snappedEnd - 1) * 1920) % 240).toBeCloseTo(0);
  await drag(page, first, zoom * 0.14, "left");
  expect(
    ((Number(await first.getAttribute("data-start")) - 1) * 1920) % 240,
  ).toBeCloseTo(0);
  expect(
    Number(await first.getAttribute("data-start")) +
      Number(await first.getAttribute("data-duration")),
  ).toBeCloseTo(snappedEnd, 8);
  await page.getByLabel("시작 (초)", { exact: true }).fill("0.413");
  await expect(first).toHaveAttribute("data-start", "0.413"); // Inspector stays precise even with Snap enabled.
  await page.getByLabel("박자표", { exact: true }).selectOption("6/8");
  await expect(page.getByLabel("BPM 기준", { exact: true })).toHaveValue(
    "dottedQuarter",
  );
  await preview.click();
  await expect(page.locator(".pr-ghost")).toHaveCount(5);
  await page.getByLabel("BPM 기준", { exact: true }).selectOption("quarter");
  await expect(apply).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "BPM 수정", exact: true }),
  ).toHaveText("120");
  await expect(page.locator(".measure-line").first()).toBeVisible();
  await page.getByLabel("박자선 보기", { exact: true }).uncheck();
  await expect(page.locator(".measure-line")).toHaveCount(0);
  await page.getByLabel("박자선 보기", { exact: true }).check();
  await page.locator("audio").evaluate((audio: HTMLAudioElement) => {
    audio.currentTime = 1.125;
  });
  await expect(page.getByTestId("musical-playhead")).toContainText(
    "M1 · B1.50",
  );
  await page
    .getByRole("button", { name: "현재 위치를 1마디 1박으로", exact: true })
    .click();
  await expect(page.getByLabel("1마디 1박 위치", { exact: true })).toHaveValue(
    "1.125",
  );
  await expect(page.getByTestId("musical-playhead")).toContainText(
    "M1 · B1.00",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel("박자표", { exact: true }).selectOption("3/4");
  await preview.scrollIntoViewIfNeeded();
  await preview.tap();
  await expect(apply).toBeEnabled();
  await apply.tap();
  await expect(page.getByTestId("quant-result")).toContainText(
    "박자 정리 적용됨",
  );
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: "test-results/quantization-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "test-results/quantization-desktop.png",
    fullPage: true,
  });
  expect(external).toEqual([]);
});
