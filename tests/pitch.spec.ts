import { test, expect } from "@playwright/test";
import { pitchTrack, pcmWav } from "./musicSignals";
import { makeMp3, makeWav } from "./fixtures";
import type { Page } from "@playwright/test";
import type { PitchResult } from "../src/pitch/pitchTypes";
const melody = pitchTrack();
async function observePitch(page: Page) {
  await page.addInitScript(() => {
    const Native = window.Worker;
    window.Worker = class extends Native {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        if (String(url).includes("pitch.worker"))
          this.addEventListener("message", (event) => {
            if (event.data?.type === "complete")
              (window as unknown as { observedPitch: unknown }).observedPitch =
                event.data.result;
          });
      }
    };
  });
}
async function complete(page: Page) {
  await expect(page.getByRole("status")).toHaveText("음악 분석 완료", {
    timeout: 160_000,
  });
  return page.evaluate(
    () => (window as unknown as { observedPitch: PitchResult }).observedPitch,
  );
}
async function uploadPitch(page: Page, seconds: number, polyphonic = false) {
  await page.getByLabel("음악 파일 선택", { exact: true }).setInputFiles({
    name: `tone-${seconds}.wav`,
    mimeType: "audio/wav",
    buffer: pcmWav(pitchTrack(seconds, polyphonic)),
  });
  await expect(page.locator(".filename")).toHaveText(`tone-${seconds}.wav`);
  await page
    .getByRole("button", { name: "음악 분석 시작", exact: true })
    .click();
}
for (const format of ["wav", "mp3"] as const) {
  test(`official Basic Pitch: actual ${format} melody inference, lazy same-origin model and valid NoteEvents`, async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const requests: string[] = [],
      forbidden: string[] = [],
      errors: string[] = [],
      models: number[] = [];
    const origin = new URL(process.env.TEST_BASE_URL ?? "http://127.0.0.1:4173")
      .origin;
    page.on("request", (request) => {
      requests.push(request.url());
      if (
        request.url().startsWith("http") &&
        (new URL(request.url()).origin !== origin || request.method() !== "GET")
      )
        forbidden.push(request.url());
    });
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("response", (response) => {
      if (response.url().includes("/models/basic-pitch/"))
        models.push(response.status());
    });
    page.on("console", (message) => {
      if (message.type() === "error")
        console.log("Pitch browser error:", message.text());
    });
    await page.addInitScript(() => {
      const Native = window.Worker;
      window.Worker = class extends Native {
        constructor(url: string | URL, options?: WorkerOptions) {
          super(url, options);
          if (String(url).includes("pitch.worker"))
            this.addEventListener("message", (event) => {
              if (event.data?.type === "complete")
                (
                  window as unknown as { observedPitch: unknown }
                ).observedPitch = event.data.result;
            });
        }
      };
    });
    await page.goto("./");
    expect(
      requests.some(
        (url) =>
          url.includes("/models/") ||
          url.includes("/assets/dist-") ||
          url.includes("/assets/esm-"),
      ),
    ).toBe(false);
    await page.getByLabel("음악 파일 선택", { exact: true }).setInputFiles({
      name: `melody.${format}`,
      mimeType: format === "wav" ? "audio/wav" : "audio/mpeg",
      buffer:
        format === "wav"
          ? pcmWav(melody)
          : makeMp3(melody.samples, melody.sampleRate),
    });
    await expect(page.locator(".filename")).toHaveText(`melody.${format}`);
    await page
      .getByRole("button", { name: "음악 분석 시작", exact: true })
      .click();
    await expect
      .poll(
        async () => {
          const alert = (await page.locator(".analysis-error").count())
            ? await page.locator(".analysis-error").textContent()
            : null;
          if (alert) throw new Error(alert);
          return page.getByRole("status").textContent();
        },
        { timeout: 160_000 },
      )
      .toBe("음악 분석 완료");
    const result = await page.evaluate(
      () => (window as unknown as { observedPitch: PitchResult }).observedPitch,
    );
    console.log(
      JSON.stringify({
        pitchFile: format,
        ...result.metadata,
        detectedMidi: result.notes.map((note) => note.midi),
        notes: result.notes.length,
      }),
    );
    expect(result.notes.length).toBeGreaterThan(0);
    for (const midi of [60, 64, 67, 72])
      expect(result.notes.some((note) => note.midi === midi)).toBe(true);
    for (const note of result.notes) {
      expect(note.start).toBeGreaterThanOrEqual(0);
      expect(note.duration).toBeGreaterThan(0);
      expect(note.start + note.duration).toBeLessThanOrEqual(10.001);
      expect(note.midi).toBeGreaterThanOrEqual(0);
      expect(note.midi).toBeLessThanOrEqual(127);
      expect(note.velocity).toBeGreaterThanOrEqual(0);
      expect(note.velocity).toBeLessThanOrEqual(127);
      expect(note.confidence).toBeGreaterThanOrEqual(0);
      expect(note.confidence).toBeLessThanOrEqual(1);
    }
    expect(
      requests.some((url) =>
        url.endsWith("/Acapella-maker/models/basic-pitch/model.json"),
      ),
    ).toBe(true);
    expect(
      requests.some((url) =>
        url.endsWith("/Acapella-maker/models/basic-pitch/group1-shard1of1.bin"),
      ),
    ).toBe(true);
    expect(result.metadata.tensorsAfter).toBeLessThanOrEqual(
      result.metadata.tensorsBefore + 5,
    );
    expect(models).toEqual([200, 200]);
    await expect(page.getByTestId("note-count")).toHaveText(
      `${result.notes.length}개`,
    );
    await page.getByText(/감지 음표 확인/).click();
    await expect(
      page.locator(".note-inspector tbody tr").first(),
    ).toBeVisible();
    await page.screenshot({
      path: `test-results/pitch-${format}.png`,
      fullPage: true,
    });
    if (format === "wav") {
      await page.setViewportSize({ width: 390, height: 844 });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(390);
      await page.screenshot({
        path: "test-results/pitch-mobile.png",
        fullPage: true,
      });
      await page.setViewportSize({ width: 1440, height: 1000 });
    }
    if (format === "wav") {
      await page.getByRole("button", { name: "BPM 수정" }).click();
      await page.getByLabel("사용할 BPM").fill("111.2");
      await page.getByRole("button", { name: "BPM 적용", exact: true }).click();
      await page.getByRole("button", { name: "Key 수정" }).click();
      await page.getByLabel("Key Root").selectOption("3");
      await page.getByLabel("Key Mode").selectOption("minor");
      await page.getByRole("button", { name: "Key 적용", exact: true }).click();
      const before = requests.filter((url) =>
        url.includes("/models/basic-pitch/"),
      ).length;
      await page
        .getByRole("button", { name: "음악 분석 시작", exact: true })
        .click();
      const repeated = await complete(page);
      expect(repeated.metadata.modelReused).toBe(true);
      expect(repeated.notes).toEqual(result.notes);
      expect(
        requests.filter((url) => url.includes("/models/basic-pitch/")).length,
      ).toBe(before);
      await expect(page.getByRole("button", { name: "BPM 수정" })).toHaveText(
        "111.2",
      );
      await expect(page.getByRole("button", { name: "Key 수정" })).toHaveText(
        "E♭ Minor",
      );
      await page
        .getByRole("button", { name: "BPM 자동값으로 되돌리기", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Key 자동값으로 되돌리기", exact: true })
        .click();
      console.log(
        JSON.stringify({
          reanalysis: repeated.metadata,
          notes: repeated.notes.length,
        }),
      );
    }
    expect(forbidden).toEqual([]);
    expect(errors).toEqual([]);
  });
}
test("actual polyphonic C major chord detects simultaneous C4/E4/G4", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await observePitch(page);
  await page.goto("./");
  await uploadPitch(page, 6, true);
  const result = await complete(page);
  const pitches = [...new Set(result.notes.map((note) => note.midi))];
  console.log(
    JSON.stringify({
      polyphonic: pitches,
      notes: result.notes.length,
      ...result.metadata,
    }),
  );
  expect(
    [60, 64, 67].filter((midi) => pitches.includes(midi)).length,
  ).toBeGreaterThanOrEqual(2);
  expect(
    result.notes.some((a, index) =>
      result.notes.some(
        (b, other) =>
          index !== other &&
          a.midi !== b.midi &&
          Math.min(a.start + a.duration, b.start + b.duration) >
            Math.max(a.start, b.start),
      ),
    ),
  ).toBe(true);
});
test("30/60/180-second actual inference has bounded tensor memory, playback, scrolling and monotonic progress", async ({
  page,
}) => {
  test.setTimeout(600_000);
  await observePitch(page);
  await page.goto("./");
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const seconds of [30, 60, 180]) {
    await uploadPitch(page, seconds);
    await page.evaluate(() => {
      const state = {
        frames: 0,
        maxGap: 0,
        previous: performance.now(),
        progress: [] as number[],
        running: true,
      };
      (window as unknown as { timing: typeof state }).timing = state;
      const tick = (time: number) => {
        if (!state.running) return;
        state.maxGap = Math.max(state.maxGap, time - state.previous);
        state.previous = time;
        state.frames++;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      const observer = new MutationObserver(() => {
        const value =
          document.querySelector<HTMLProgressElement>("progress")?.value;
        if (value !== undefined && value !== state.progress.at(-1))
          state.progress.push(value);
      });
      observer.observe(document.body, {
        attributes: true,
        childList: true,
        subtree: true,
      });
      (
        window as unknown as { timingObserver: MutationObserver }
      ).timingObserver = observer;
    });
    await page
      .locator("audio")
      .evaluate((audio: HTMLAudioElement) => audio.play());
    await expect(page.locator(".model-status")).toContainText(
      "AI 음표 모델 준비 완료",
      { timeout: 30_000 },
    );
    await page.mouse.wheel(0, 300);
    const result = await complete(page);
    const timing = await page.evaluate(() => {
      const state = (
        window as unknown as {
          timing: {
            frames: number;
            maxGap: number;
            progress: number[];
            running: boolean;
          };
        }
      ).timing;
      state.running = false;
      (
        window as unknown as { timingObserver: MutationObserver }
      ).timingObserver.disconnect();
      return state;
    });
    console.log(
      JSON.stringify({
        lengthSeconds: seconds,
        ...result.metadata,
        notes: result.notes.length,
        uiFrames: timing.frames,
        maxUiFrameGapMs: timing.maxGap,
        progressSamples: timing.progress.length,
      }),
    );
    expect(result.notes.length).toBeGreaterThan(seconds / 4);
    expect(result.metadata.tensorsAfter).toBeLessThanOrEqual(
      result.metadata.tensorsBefore + 5,
    );
    expect(timing.frames).toBeGreaterThan(20);
    expect(timing.maxGap).toBeLessThan(750);
    expect(timing.progress.length).toBeGreaterThan(5);
    expect(
      timing.progress.every(
        (fraction, index) =>
          fraction >= 0 &&
          fraction <= 1 &&
          (index === 0 || fraction >= timing.progress[index - 1]),
      ),
    ).toBe(true);
    expect(
      await page
        .locator("audio")
        .evaluate((audio: HTMLAudioElement) => audio.currentTime),
    ).toBeGreaterThan(1);
  }
  expect(errors).toEqual([]);
});
test("cancel during Pitch destroys inference, file replacement/removal discards old notes, and retry works", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await observePitch(page);
  await page.goto("./");
  await uploadPitch(page, 60);
  await expect(page.locator(".model-status")).toContainText(
    "AI 음표 모델 준비 완료",
    { timeout: 30_000 },
  );
  await page.getByRole("button", { name: "분석 취소", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("분석을 취소했습니다.");
  await expect.poll(() => page.workers().length).toBe(0);
  await expect(page.getByTestId("note-count")).toHaveCount(0);
  await uploadPitch(page, 4);
  const retry = await complete(page);
  expect(retry.notes.length).toBeGreaterThan(0);
  await page
    .getByRole("button", { name: "음악 분석 시작", exact: true })
    .click();
  await expect(page.locator(".model-status")).toContainText(
    "AI 음표 모델 준비 완료",
    { timeout: 30_000 },
  );
  await page.getByLabel("음악 파일 선택", { exact: true }).setInputFiles({
    name: "new-silence.wav",
    mimeType: "audio/wav",
    buffer: makeWav(4, 22050, 1, true),
  });
  await expect(page.locator(".filename")).toHaveText("new-silence.wav");
  await expect(page.getByTestId("note-count")).toHaveCount(0);
  await expect.poll(() => page.workers().length).toBe(0);
  await page
    .getByRole("button", { name: "음악 분석 시작", exact: true })
    .click();
  const silence = await complete(page);
  console.log(
    JSON.stringify({ silenceNotes: silence.notes.length, ...silence.metadata }),
  );
  expect(silence.notes).toEqual([]);
  await expect(page.locator(".pitch-empty")).toContainText(
    "뚜렷한 음표를 찾지 못했습니다.",
  );
  await page.getByRole("button", { name: "음원 제거", exact: true }).click();
  await expect(page.getByTestId("note-count")).toHaveCount(0);
});
test("same-origin model failure clears cache and retry restores inference while BPM/Key and playback survive", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await observePitch(page);
  await page.route("**/models/basic-pitch/model.json", (route) =>
    route.fulfill({ status: 404, body: "not found" }),
  );
  await page.goto("./");
  await uploadPitch(page, 4);
  await expect(page.locator(".analysis-error")).toContainText("AI 음표 모델", {
    timeout: 30_000,
  });
  await expect(page.getByRole("button", { name: "BPM 수정" })).toBeEnabled();
  await page
    .locator("audio")
    .evaluate((audio: HTMLAudioElement) => audio.play());
  await expect
    .poll(() =>
      page
        .locator("audio")
        .evaluate((audio: HTMLAudioElement) => audio.currentTime),
    )
    .toBeGreaterThan(0.1);
  await page.unroute("**/models/basic-pitch/model.json");
  await page
    .getByRole("button", { name: "음악 분석 시작", exact: true })
    .click();
  expect((await complete(page)).notes.length).toBeGreaterThan(0);
});
test("no OffscreenCanvas/WebGL: actual CPU fallback inference works", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await observePitch(page);
  await page.route("**/assets/pitch.worker-*.js", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body: `globalThis.OffscreenCanvas = undefined;\n${await response.text()}`,
    });
  });
  await page.goto("./");
  await uploadPitch(page, 4);
  const result = await complete(page);
  expect(result.metadata.backend).toBe("cpu");
  expect(result.notes.some((note) => note.midi === 60)).toBe(true);
  console.log(
    JSON.stringify({
      cpuFallback: true,
      ...result.metadata,
      notes: result.notes.length,
    }),
  );
});
