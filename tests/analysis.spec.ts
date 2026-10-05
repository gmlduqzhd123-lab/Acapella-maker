import { test, expect } from "@playwright/test";
import { chordTrack, pcmWav } from "./musicSignals";
import { makeMp3, makeWav } from "./fixtures";
test.setTimeout(180_000);
const cMajor = chordTrack();
const musicWav = {
  name: "코드 진행.wav",
  mimeType: "audio/wav",
  buffer: pcmWav(cMajor),
};
const musicMp3 = {
  name: "코드 진행.mp3",
  mimeType: "audio/mpeg",
  buffer: makeMp3(cMajor.samples, cMajor.sampleRate),
};
const gMajor = {
  name: "새로운 곡.wav",
  mimeType: "audio/wav",
  buffer: pcmWav(chordTrack(7, "major", 90, 20)),
};
const longMusic = {
  name: "10분 코드 진행.wav",
  mimeType: "audio/wav",
  buffer: pcmWav(chordTrack(0, "major", 120, 600, 8000)),
};

for (const file of [musicWav, musicMp3]) {
  test(`${file.name}: real decoding → Worker BPM/Key → manual edits → automatic restore; no uploads`, async ({
    page,
  }) => {
    const external: string[] = [],
      errors: string[] = [],
      workers: string[] = [];
    const allowedOrigin = new URL(
      process.env.TEST_BASE_URL ?? "http://127.0.0.1:4173",
    ).origin;
    await page.addInitScript(() => {
      const Native = window.Worker;
      window.Worker = class extends Native {
        constructor(url: string | URL, options?: WorkerOptions) {
          super(url, options);
          this.addEventListener("message", (event) => {
            if (
              String(url).includes("analysis.worker") &&
              event.data?.type === "complete"
            )
              (
                window as unknown as { observedAnalysis: unknown }
              ).observedAnalysis = event.data.result;
          });
        }
      };
    });
    page.on("request", (request) => {
      if (
        (request.url().startsWith("http") &&
          new URL(request.url()).origin !== allowedOrigin) ||
        request.method() !== "GET"
      )
        external.push(request.url());
    });
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("worker", (worker) => workers.push(worker.url()));
    await page.goto("./");
    await expect(
      page.getByRole("button", { name: "음악 분석 시작", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByText("분석할 음악 파일을 여기에 놓아주세요.", { exact: true }),
    ).toBeVisible();
    await page
      .getByLabel("음악 파일 선택", { exact: true })
      .setInputFiles(file);
    await expect(page.locator(".filename")).toHaveText(file.name);
    await expect(page.getByRole("button", { name: "BPM 수정" })).toHaveText(
      "분석 전",
    );
    await page
      .getByRole("button", { name: "음악 분석 시작", exact: true })
      .click();
    await expect(page.getByRole("status")).toHaveText("음악 분석 완료", {
      timeout: 20000,
    });
    const automaticBpm = await page
      .getByRole("button", { name: "BPM 수정" })
      .textContent();
    const automaticKey = await page
      .getByRole("button", { name: "Key 수정" })
      .textContent();
    expect(Number(automaticBpm)).toBeGreaterThanOrEqual(118);
    expect(Number(automaticBpm)).toBeLessThanOrEqual(122);
    expect(automaticKey).toBe("C Major");
    await expect(page.locator(".auto-detail")).toHaveCount(2);
    const observed = await page.evaluate(
      () =>
        (
          window as unknown as {
            observedAnalysis: {
              bpm: number;
              bpmConfidence: number;
              key: { tonic: number; mode: string; confidence: number };
              notes: unknown[];
            };
          }
        ).observedAnalysis,
    );
    // The BPM/Key worker reports an intermediate result; the UI completes only after real Pitch.
    expect(observed.notes).toEqual([]);
    await expect(page.getByTestId("note-count")).not.toHaveText("0개");
    console.log(
      JSON.stringify({
        fileAnalysis: file.name,
        bpm: observed.bpm,
        bpmError: observed.bpm - 120,
        bpmConfidence: observed.bpmConfidence,
        key: automaticKey,
        keyConfidence: observed.key.confidence,
      }),
    );
    expect(workers.some((url) => url.includes("analysis.worker"))).toBe(true);
    const expectedPath = new URL(
      process.env.TEST_BASE_URL ??
        `http://127.0.0.1:4173${process.env.PAGES_BASE_PATH ?? "/Acapella-maker/"}`,
    ).pathname;
    expect(
      workers.every((url) => new URL(url).pathname.startsWith(expectedPath)),
    ).toBe(true);
    await page.getByRole("button", { name: "BPM 수정" }).click();
    await page.getByLabel("사용할 BPM").fill("97.3");
    await page.getByRole("button", { name: "BPM 적용", exact: true }).click();
    await expect(page.getByRole("button", { name: "BPM 수정" })).toHaveText(
      "97.3",
    );
    await page.getByRole("button", { name: "Key 수정" }).click();
    await page.getByLabel("Key Root").selectOption("3");
    await page.getByLabel("Key Mode").selectOption("minor");
    await page.getByRole("button", { name: "Key 적용", exact: true }).click();
    await expect(page.getByRole("button", { name: "Key 수정" })).toHaveText(
      "E♭ Minor",
    );
    await page
      .getByRole("button", { name: "BPM 자동값으로 되돌리기", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Key 자동값으로 되돌리기", exact: true })
      .click();
    await expect(page.getByRole("button", { name: "BPM 수정" })).toHaveText(
      automaticBpm!,
    );
    await expect(page.getByRole("button", { name: "Key 수정" })).toHaveText(
      automaticKey!,
    );
    await page
      .locator("audio")
      .evaluate((audio: HTMLAudioElement) => audio.play());
    await expect
      .poll(() =>
        page
          .locator("audio")
          .evaluate((audio: HTMLAudioElement) => audio.currentTime),
      )
      .toBeGreaterThan(0.2);
    expect(external).toEqual([]);
    expect(errors).toEqual([]);
    await page.screenshot({
      path: `test-results/analysis-${file.name.endsWith(".mp3") ? "mp3" : "wav"}.png`,
      fullPage: true,
    });
  });
}

test("ten-minute real PCM: responsive UI, measured progress, cancel Worker, replace/remove safely without stale results", async ({
  page,
}) => {
  await page.goto("./");
  await page
    .getByLabel("음악 파일 선택", { exact: true })
    .setInputFiles(longMusic);
  await expect(page.locator(".filename")).toHaveText(longMusic.name, {
    timeout: 20000,
  });
  await page.evaluate(() => {
    const state = {
      frames: 0,
      maxGap: 0,
      previous: performance.now(),
      progress: [] as number[],
    };
    (window as unknown as { timing: typeof state }).timing = state;
    const tick = (time: number) => {
      state.maxGap = Math.max(state.maxGap, time - state.previous);
      state.previous = time;
      state.frames++;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    new MutationObserver(() => {
      const element = document.querySelector<HTMLProgressElement>("progress");
      if (element && state.progress.at(-1) !== element.value)
        state.progress.push(element.value);
    }).observe(document.body, {
      attributes: true,
      childList: true,
      subtree: true,
    });
  });
  await page
    .locator("audio")
    .evaluate((audio: HTMLAudioElement) => audio.play());
  await page
    .getByRole("button", { name: "음악 분석 시작", exact: true })
    .click();
  await expect
    .poll(
      () =>
        page
          .locator("progress")
          .evaluate((progress: HTMLProgressElement) => progress.value),
      { timeout: 30000, intervals: [50, 100, 150] },
    )
    .toBeGreaterThan(0.12);
  await page.getByRole("button", { name: "분석 취소", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("분석을 취소했습니다.");
  await expect
    .poll(
      () =>
        page
          .workers()
          .filter((worker) => worker.url().includes("analysis.worker")).length,
    )
    .toBe(0);
  const timing = await page.evaluate(
    () =>
      (
        window as unknown as {
          timing: { frames: number; maxGap: number; progress: number[] };
        }
      ).timing,
  );
  console.log(
    JSON.stringify({
      tenMinuteAnalysis: "cancelled during BPM",
      frames: timing.frames,
      maxUiFrameGapMs: timing.maxGap,
      progressSamples: timing.progress.length,
    }),
  );
  expect(timing.frames).toBeGreaterThan(10);
  expect(timing.maxGap).toBeLessThan(750);
  expect(
    timing.progress.every(
      (value, index) =>
        value >= 0 &&
        value <= 1 &&
        (index === 0 || value >= timing.progress[index - 1]),
    ),
  ).toBe(true);
  await expect
    .poll(() =>
      page
        .locator("audio")
        .evaluate((audio: HTMLAudioElement) => audio.currentTime),
    )
    .toBeGreaterThan(1);

  const nextWorker = page.waitForEvent("worker", {
    predicate: (worker) => worker.url().includes("analysis.worker"),
  });
  await page
    .getByRole("button", { name: "음악 분석 시작", exact: true })
    .click();
  await nextWorker;
  await page
    .getByLabel("음악 파일 선택", { exact: true })
    .setInputFiles(gMajor);
  await expect(page.locator(".filename")).toHaveText(gMajor.name);
  await expect(page.getByRole("button", { name: "BPM 수정" })).toHaveText(
    "분석 전",
  );
  await expect
    .poll(
      () =>
        page
          .workers()
          .filter((worker) => worker.url().includes("analysis.worker")).length,
    )
    .toBe(0);
  await page
    .getByRole("button", { name: "음악 분석 시작", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText("음악 분석 완료", {
    timeout: 120_000,
  });
  await expect(page.getByRole("button", { name: "Key 수정" })).toHaveText(
    "G Major",
  );
  expect(
    Number(await page.getByRole("button", { name: "BPM 수정" }).textContent()),
  ).toBeGreaterThanOrEqual(88);
  expect(
    Number(await page.getByRole("button", { name: "BPM 수정" }).textContent()),
  ).toBeLessThanOrEqual(92);

  await page
    .getByLabel("음악 파일 선택", { exact: true })
    .setInputFiles(longMusic);
  await expect(page.locator(".filename")).toHaveText(longMusic.name, {
    timeout: 20000,
  });
  const removeWorker = page.waitForEvent("worker", {
    predicate: (worker) => worker.url().includes("analysis.worker"),
  });
  await page
    .getByRole("button", { name: "음악 분석 시작", exact: true })
    .click();
  await removeWorker;
  await page.getByRole("button", { name: "음원 제거", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "음악 분석 시작", exact: true }),
  ).toBeDisabled();
  await expect(page.locator("audio")).toHaveCount(0);
  // An idle Pitch worker retains the model across files; only active analysis must stop.
  await expect
    .poll(
      () =>
        page
          .workers()
          .filter((worker) => worker.url().includes("analysis.worker")).length,
    )
    .toBe(0);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("silent audio has no invented values, supports manual values, and next import clears overrides", async ({
  page,
}) => {
  await page.goto("./");
  await page.getByLabel("음악 파일 선택", { exact: true }).setInputFiles({
    name: "silence.wav",
    mimeType: "audio/wav",
    buffer: makeWav(4, 22050, 1, true),
  });
  await expect(page.locator(".filename")).toHaveText("silence.wav");
  await page
    .getByRole("button", { name: "음악 분석 시작", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText("음악 분석 완료", {
    timeout: 120_000,
  });
  await expect(page.getByRole("button", { name: "BPM 수정" })).toHaveText(
    "추정 불가",
  );
  await expect(page.getByRole("button", { name: "Key 수정" })).toHaveText(
    "추정 불가",
  );
  await expect(page.locator(".analysis-warning")).toHaveCount(2);
  await page.getByRole("button", { name: "BPM 수정" }).click();
  await page.getByLabel("사용할 BPM").fill("100");
  await page.getByRole("button", { name: "BPM 적용", exact: true }).click();
  await expect(page.getByRole("button", { name: "BPM 수정" })).toHaveText(
    "100",
  );
  await page
    .getByRole("button", { name: "BPM 자동값으로 되돌리기", exact: true })
    .click();
  await expect(page.getByRole("button", { name: "BPM 수정" })).toHaveText(
    "추정 불가",
  );
  await page
    .getByLabel("음악 파일 선택", { exact: true })
    .setInputFiles(musicWav);
  await expect(page.locator(".filename")).toHaveText(musicWav.name);
  await expect(page.locator(".analysis-warning")).toHaveCount(0);
});

test("analysis-only Worker startup failure is recoverable and leaves playback working", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const Native = window.Worker;
    window.Worker = class extends Native {
      constructor(url: string | URL, options?: WorkerOptions) {
        if (String(url).includes("analysis.worker"))
          throw new Error("Analysis worker blocked");
        super(url, options);
      }
    };
  });
  await page.goto("./");
  await page
    .getByLabel("음악 파일 선택", { exact: true })
    .setInputFiles(musicWav);
  await expect(page.locator(".filename")).toHaveText(musicWav.name);
  await page
    .getByRole("button", { name: "음악 분석 시작", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "분석 Worker를 시작하지 못했습니다",
  );
  await expect(
    page.getByRole("button", { name: "음악 분석 시작", exact: true }),
  ).toBeEnabled();
  await page
    .locator("audio")
    .evaluate((audio: HTMLAudioElement) => audio.play());
  await expect
    .poll(() =>
      page
        .locator("audio")
        .evaluate((audio: HTMLAudioElement) => audio.currentTime),
    )
    .toBeGreaterThan(0.2);
});
