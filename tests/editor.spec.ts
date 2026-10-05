import { test, expect } from "@playwright/test";
import type { Page, Locator } from "@playwright/test";
import { pitchTrack, pcmWav } from "./musicSignals";
import { makeMp3 } from "./fixtures";
test.use({ actionTimeout: 15_000, hasTouch: true });
async function analyze(page: Page, format: "wav" | "mp3" = "wav", fit = true) {
  await page.goto("./");
  await expect(
    page.getByRole("tab", { name: "Piano Roll", exact: true }),
  ).toBeDisabled();
  const input = pitchTrack();
  await page.getByLabel("음악 파일 선택", { exact: true }).setInputFiles({
    name: `editor.${format}`,
    mimeType: format === "wav" ? "audio/wav" : "audio/mpeg",
    buffer:
      format === "wav"
        ? pcmWav(input)
        : makeMp3(input.samples, input.sampleRate),
  });
  await page
    .getByRole("button", { name: "음악 분석 시작", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText("음악 분석 완료", {
    timeout: 160_000,
  });
  await page.getByRole("tab", { name: "Piano Roll", exact: true }).click();
  if (fit)
    await page.getByRole("button", { name: "전체 보기", exact: true }).click();
}
async function drag(
  page: Page,
  locator: Locator,
  dx: number,
  dy: number,
  edge?: "left" | "right",
) {
  await locator.scrollIntoViewIfNeeded();
  const box = (await locator.boundingBox())!;
  const x =
    edge === "left"
      ? box.x + 2
      : edge === "right"
        ? box.x + box.width - 2
        : box.x + box.width / 2;
  await page.mouse.move(x, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(x + dx, box.y + box.height / 2 + dy, { steps: 8 });
  await page.mouse.up();
}
test("real WAV inference → Piano Roll → drag/resize/inspector/add/delete/history/reset, seek and reanalysis protection", async ({
  page,
}) => {
  test.setTimeout(360_000);
  const forbidden: string[] = [];
  page.on("request", (request) => {
    if (
      request.url().startsWith("http") &&
      (new URL(request.url()).origin !==
        new URL(process.env.TEST_BASE_URL ?? "http://127.0.0.1:4173").origin ||
        request.method() !== "GET")
    )
      forbidden.push(request.url());
  });
  await analyze(page);
  // Set precise known scale after asserting that Fit View renders the full input.
  await expect(page.locator(".pr-note")).toHaveCount(5);
  // Inspector tests below use 80px/sec. Widen only this editing test so all five notes stay in view.
  await page.setViewportSize({ width: 2200, height: 1200 });
  await page.getByRole("button", { name: "전체 보기", exact: true }).click();
  const initialZoom = await page
    .locator(".pr-grid")
    .evaluate((element: HTMLElement) => parseFloat(element.style.width) / 10);
  const notes = page.locator(".pr-note");
  await expect(notes).toHaveCount(5);
  for (const midi of [60, 64, 67, 72])
    await expect(
      page.locator(`.pr-note[data-midi="${midi}"]`).first(),
    ).toBeVisible();
  const original = await notes.evaluateAll((elements) =>
    elements.map((element) => ({
      id: element.getAttribute("data-note-id"),
      midi: element.getAttribute("data-midi"),
      start: element.getAttribute("data-start"),
      duration: element.getAttribute("data-duration"),
    })),
  );
  const first = page.locator(`[data-note-id="${original[0].id}"]`);
  const rowHeight = Number(
    await page.locator(".pr-viewport").getAttribute("data-row-height"),
  );
  await drag(page, first, 0, -rowHeight);
  await expect(first).toHaveAttribute("data-midi", "61");
  await expect(page.getByTestId("selected-pitch")).toHaveText("C♯4");
  await page.getByRole("button", { name: "↶ 실행 취소", exact: true }).click();
  await expect(first).toHaveAttribute("data-midi", "60");
  await expect(
    page.getByRole("button", { name: "↶ 실행 취소", exact: true }),
  ).toBeDisabled();
  await drag(page, first, initialZoom * 0.5, 0);
  expect(Number(await first.getAttribute("data-start"))).toBeCloseTo(
    Number(original[0].start) + 0.5,
    2,
  );
  const beforeResize = Number(await first.getAttribute("data-duration"));
  await drag(page, first, initialZoom * 0.5, 0, "right");
  expect(Number(await first.getAttribute("data-duration"))).toBeCloseTo(
    beforeResize + 0.5,
    2,
  );
  const beforeLeft = Number(await first.getAttribute("data-start"));
  await drag(page, first, -initialZoom * 0.2, 0, "left");
  expect(Number(await first.getAttribute("data-start"))).toBeCloseTo(
    beforeLeft - 0.2,
    2,
  );
  await page.getByLabel("MIDI 음높이", { exact: true }).fill("62");
  await expect(first).toHaveAttribute("data-midi", "62");
  await page.getByLabel("시작 (초)", { exact: true }).fill("1.501");
  await expect(first).toHaveAttribute("data-start", "1.501");
  await page.getByLabel("길이 (초)", { exact: true }).fill("0.48");
  await expect(first).toHaveAttribute("data-duration", "0.48");
  await page
    .getByRole("tab", { name: "음원 · 음악 분석", exact: true })
    .click();
  await page.getByRole("tab", { name: "Piano Roll", exact: true }).click();
  await expect(page.getByLabel("시작 (초)", { exact: true })).toHaveValue(
    "1.501",
  );
  await page.getByLabel("시작 (초)", { exact: true }).press("Backspace");
  await expect(notes).toHaveCount(5);
  await page.getByLabel("시작 (초)", { exact: true }).fill("1.501");
  await page.getByRole("button", { name: "음표 추가", exact: true }).click();
  const grid = page.locator(".pr-grid");
  const box = (await grid.boundingBox())!;
  const currentZoom = await grid.evaluate(
    (element: HTMLElement) => parseFloat(element.style.width) / 10,
  );
  const currentRowHeight = Number(
    await page.locator(".pr-viewport").getAttribute("data-row-height"),
  );
  // Empty row C♯5, exactly 1.125 seconds: no beat snap.
  await grid.click({
    position: {
      x: currentZoom * 1.125,
      y: (127 - 73) * currentRowHeight + currentRowHeight / 2,
    },
    force: true,
  });
  const manual = page.locator('[data-note-id="manual-000001"]');
  expect(
    Math.abs(Number(await manual.getAttribute("data-start")) - 1.125),
  ).toBeLessThan(1 / currentZoom);
  await expect(page.getByTestId("working-count")).toHaveText("6");
  await expect(
    page.getByRole("region", { name: "선택 음표 정보" }),
  ).toContainText("직접 추가");
  await expect(
    page.getByRole("region", { name: "선택 음표 정보" }),
  ).not.toContainText("AI 음표 강도 100%");
  await manual.focus();
  await page.keyboard.press("Delete");
  await expect(page.getByTestId("working-count")).toHaveText("5");
  await page.keyboard.press("Control+z");
  await expect(manual).toHaveCount(1);
  await page.keyboard.press("Control+Shift+z");
  await expect(manual).toHaveCount(0);
  await page
    .getByRole("button", { name: "AI 분석본으로 되돌리기", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "지금까지 수정한 음표가 모두 초기화됩니다.",
  );
  await page.getByRole("button", { name: "취소", exact: true }).click();
  await expect(first).toHaveAttribute("data-midi", "62");
  await page
    .getByRole("button", { name: "AI 분석본으로 되돌리기", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "AI 분석본으로 되돌리기", exact: true })
    .click();
  expect(
    await notes.evaluateAll((elements) =>
      elements.map((element) => ({
        id: element.getAttribute("data-note-id"),
        midi: element.getAttribute("data-midi"),
        start: element.getAttribute("data-start"),
        duration: element.getAttribute("data-duration"),
      })),
    ),
  ).toEqual(original);
  await page
    .getByLabel("낮은 AI 강도 음표 보기", { exact: true })
    .selectOption("0.3");
  expect(await notes.count()).toBeLessThan(5);
  await expect(page.getByTestId("working-count")).toHaveText("5");
  await page
    .getByLabel("낮은 AI 강도 음표 보기", { exact: true })
    .selectOption("1.01");
  await page.getByRole("button", { name: "시간 확대", exact: true }).click();
  expect(
    Number((await page.getByTestId("time-zoom").textContent())!.split(" ")[0]),
  ).toBeCloseTo(currentZoom * 1.5, 0);
  await page.getByRole("button", { name: "전체 보기", exact: true }).click();
  const zoom = Number(
    (await page.getByTestId("time-zoom").textContent())!.split(" ")[0],
  );
  await page
    .getByLabel("Piano Roll 시간 눈금", { exact: true })
    .click({ position: { x: 64 + zoom * 2, y: 12 } });
  await expect
    .poll(() =>
      page
        .locator("audio")
        .evaluate((element: HTMLAudioElement) => element.currentTime),
    )
    .toBeCloseTo(2, 1);
  await page
    .getByRole("button", { name: "원본 음원 재생", exact: true })
    .click();
  await expect
    .poll(() => page.getByTestId("piano-playhead").getAttribute("data-time"))
    .not.toBe("2");
  await expect
    .poll(async () => {
      const audioTime = await page
        .locator("audio")
        .evaluate((element: HTMLAudioElement) => element.currentTime);
      const playhead = Number(
        await page.getByTestId("piano-playhead").getAttribute("data-time"),
      );
      return Math.abs(audioTime - playhead);
    })
    .toBeLessThan(0.2);
  await page
    .getByRole("button", { name: "원본 음원 일시정지", exact: true })
    .click();
  await first.click();
  await page.getByLabel("MIDI 음높이", { exact: true }).fill("61");
  await page
    .getByRole("button", { name: "음악 분석 시작", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "현재 수정한 음표가 있습니다.",
  );
  await page.getByRole("button", { name: "취소", exact: true }).click();
  await expect(first).toHaveAttribute("data-midi", "61");
  await page
    .getByRole("button", { name: "음악 분석 시작", exact: true })
    .click();
  await page.getByRole("button", { name: "다시 분석", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("음악 분석 완료", {
    timeout: 160_000,
  });
  await expect(first).toHaveAttribute("data-midi", "60");
  await expect(page.locator(".pr-summary")).toContainText("AI 분석 원본");
  await first.click();
  await page.getByLabel("MIDI 음높이", { exact: true }).fill("61");
  await page
    .getByRole("button", { name: "음악 분석 시작", exact: true })
    .click();
  await page.getByRole("button", { name: "다시 분석", exact: true }).click();
  await page.getByRole("button", { name: "분석 취소", exact: true }).click();
  await expect(first).toHaveAttribute("data-midi", "61");
  await expect(page.locator(".pr-summary")).toContainText("수정됨");
  await page
    .getByRole("button", { name: "AI 분석본으로 되돌리기", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "AI 분석본으로 되돌리기", exact: true })
    .click();
  expect(forbidden).toEqual([]);
  expect(box.width).toBeGreaterThan(0);
  await page.screenshot({
    path: "test-results/editor-desktop.png",
    fullPage: true,
  });
});
test("real MP3 Piano Roll, mobile selection/inspector and scroll without page overflow; replacement clears history", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await analyze(page, "mp3");
  await expect(page.locator(".pr-note")).toHaveCount(5);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".pr-viewport").evaluate((element) => {
    element.scrollTop =
      (127 - 72) * Number(element.getAttribute("data-row-height"));
  });
  await page.locator('.pr-note[data-midi="60"]').first().tap();
  await page.getByLabel("MIDI 음높이", { exact: true }).fill("61");
  await expect(page.getByTestId("selected-pitch")).toHaveText("C♯4");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.locator(".pr-viewport").evaluate((element) => {
    element.scrollTop += 100;
    element.scrollLeft = 100;
  });
  await page.screenshot({
    path: "test-results/editor-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("tab", { name: "음원 · 음악 분석", exact: true })
    .click();
  await page.getByLabel("음악 파일 선택", { exact: true }).setInputFiles({
    name: "new.wav",
    mimeType: "audio/wav",
    buffer: pcmWav(pitchTrack(4)),
  });
  await expect(page.locator(".filename")).toHaveText("new.wav");
  await expect(
    page.getByRole("tab", { name: "Piano Roll", exact: true }),
  ).toBeDisabled();
});
test("synthetic UI-only 2000-note performance fixture: virtualized DOM and selection", async ({
  page,
}) => {
  // This test only measures editor UI. Actual model inference remains in all existing tests and two tests above.
  await page.addInitScript(() => {
    const Native = window.Worker;
    window.Worker = class extends Native {
      private isPitch: boolean;
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.isPitch = String(url).includes("pitch.worker");
      }
      postMessage(
        message: { id: string; input: { duration: number } },
        transfer?: Transferable[] | StructuredSerializeOptions,
      ) {
        if (!this.isPitch) {
          if (Array.isArray(transfer)) super.postMessage(message, transfer);
          else super.postMessage(message, transfer);
          return;
        }
        const notes = Array.from({ length: 2000 }, (_, index) => ({
          id: `bp-${String(index + 1).padStart(6, "0")}`,
          start: index / 200,
          duration: 0.005,
          midi: 48 + (index % 37),
          velocity: 100,
          confidence: 0.8,
        }));
        setTimeout(
          () =>
            this.dispatchEvent(
              new MessageEvent("message", {
                data: {
                  type: "complete",
                  id: message.id,
                  result: {
                    notes,
                    metadata: {
                      backend: "cpu",
                      modelLoadMs: 0,
                      inferenceMs: 0,
                      mappingMs: 0,
                      modelReused: false,
                      windowSeconds: 30,
                      tensorsBefore: 0,
                      tensorsAfter: 0,
                    },
                  },
                },
              }),
            ),
          10,
        );
      }
    };
  });
  const began = Date.now();
  await analyze(page, "wav", false);
  await expect(page.getByTestId("working-count")).toHaveText("2000");
  const rendered = await page.locator(".pr-note").count();
  expect(rendered).toBeGreaterThan(0);
  expect(rendered).toBeLessThan(2000);
  const dom = await page.locator(".piano-roll *").count();
  expect(dom).toBeLessThan(3500);
  const selectStart = Date.now();
  await page.locator(".pr-note").first().click();
  await expect(
    page.getByRole("region", { name: "선택 음표 정보" }),
  ).toBeVisible();
  expect(Date.now() - selectStart).toBeLessThan(3000);
  console.log(
    JSON.stringify({
      editorPerformance: true,
      totalNotes: 2000,
      renderedNotes: rendered,
      domNodes: dom,
      selectionMs: Date.now() - selectStart,
      setupAndRenderMs: Date.now() - began,
    }),
  );
  await page.getByRole("button", { name: "BPM 수정", exact: true }).click();
  await page.getByLabel("사용할 BPM", { exact: true }).fill("120");
  await page.getByRole("button", { name: "BPM 적용", exact: true }).click();
  const previewStart = Date.now();
  await page
    .getByRole("button", { name: "Quantization 미리보기", exact: true })
    .click();
  await expect(page.getByTestId("quant-result")).toContainText("총 음표 2000");
  await expect(page.getByTestId("working-count")).toHaveText("2000");
  const previewMs = Date.now() - previewStart;
  expect(previewMs).toBeLessThan(3000);
  const ghosts = await page.locator(".pr-ghost").count();
  expect(ghosts).toBeGreaterThan(0);
  expect(ghosts).toBeLessThan(2000);
  const previewDom = await page.locator(".piano-roll *").count();
  const previewVisible = await page.locator(".pr-note").count();
  // Toolbar auto-scroll can reveal a different pitch/time viewport. Each real
  // note has three children; each ghost has none. Grid/table overhead is bounded.
  expect(previewVisible).toBeLessThan(2000);
  expect(previewDom).toBeLessThan(previewVisible * 4 + ghosts + 600);
  console.log(
    JSON.stringify({
      quantizationUiPerformance: true,
      totalNotes: 2000,
      previewMs,
      ghostNotes: ghosts,
      visibleNotes: previewVisible,
      domNodes: previewDom,
    }),
  );
});
