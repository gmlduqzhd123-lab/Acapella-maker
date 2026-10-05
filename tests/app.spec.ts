import { test, expect } from "@playwright/test";
import { makeWav, makeMp3 } from "./fixtures";
const wav = {
  name: "멜로디 테스트.wav",
  mimeType: "audio/wav",
  buffer: makeWav(),
};
const mp3 = {
  name: "실제 MP3 테스트.mp3",
  mimeType: "audio/mpeg",
  buffer: makeMp3(),
};

test("home, file chooser, actual WAV decode, worker waveform, playback, seek, no external upload", async ({
  page,
}) => {
  const errors: string[] = [];
  const network: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (
      request.url().startsWith("http") &&
      new URL(request.url()).origin !==
        new URL(process.env.TEST_BASE_URL ?? "http://127.0.0.1:4173").origin
    )
      network.push(request.url());
    if (request.method() !== "GET")
      network.push(request.method() + " " + request.url());
  });
  await page.goto("./");
  await expect(page).toHaveTitle(/AcaScore AI/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "부를 수 있는 악보로.",
  );
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "새 악보 만들기" }).click();
  await (await chooser).setFiles(wav);
  await expect(page.getByText("음원 준비 완료", { exact: true })).toBeVisible();
  await expect(page.locator(".filename")).toHaveText(wav.name);
  await expect(page.locator("dd").nth(0)).toHaveText("0:03");
  await expect(page.locator("dd").nth(2)).toHaveText("WAV");
  await expect(page.locator(".waveform rect")).toHaveCount(180);
  await page
    .locator("audio")
    .evaluate((element: HTMLAudioElement) => element.play());
  await expect
    .poll(() =>
      page
        .locator("audio")
        .evaluate((element: HTMLAudioElement) => element.currentTime),
    )
    .toBeGreaterThan(0.2);
  await page
    .locator("audio")
    .evaluate((element: HTMLAudioElement) => element.pause());
  const box = await page.locator(".waveform").boundingBox();
  if (!box) throw new Error("No waveform");
  await page.mouse.click(box.x + box.width * 0.6, box.y + box.height / 2);
  await expect
    .poll(() =>
      page
        .locator("audio")
        .evaluate((element: HTMLAudioElement) => element.currentTime),
    )
    .toBeGreaterThan(1.5);
  await page.screenshot({
    path: "test-results/desktop-upload.png",
    fullPage: true,
  });
  expect(network).toEqual([]);
  expect(errors).toEqual([]);
  await page.getByRole("button", { name: "음원 제거" }).click();
  await expect(page.locator("audio")).toHaveCount(0);
  await expect(page.getByText("첫 음원을 기다리고 있어요")).toBeVisible();
});

test("real MP3 decoding and replacing with the same file repeatedly", async ({
  page,
}) => {
  await page.goto("./");
  await page.getByLabel("음악 파일 선택", { exact: true }).setInputFiles(mp3);
  await expect(page.locator(".filename")).toHaveText(mp3.name);
  await expect(page.locator("dd").nth(2)).toHaveText("MP3");
  await expect(page.locator("audio")).toBeVisible();
  await page
    .locator("audio")
    .evaluate((element: HTMLAudioElement) => element.play());
  await expect
    .poll(() =>
      page
        .locator("audio")
        .evaluate((element: HTMLAudioElement) => element.currentTime),
    )
    .toBeGreaterThan(0.2);
  await page.getByLabel("음악 파일 선택", { exact: true }).setInputFiles(wav);
  await expect(page.locator(".filename")).toHaveText(wav.name);
  await page.getByLabel("음악 파일 선택", { exact: true }).setInputFiles(wav);
  await expect(page.getByText("음원 준비 완료", { exact: true })).toBeVisible();
  await expect(page.locator("audio")).toHaveCount(1);
});

test("actual drag and drop, uppercase extensions, and right-channel waveform", async ({
  page,
}) => {
  await page.goto("./");
  const bytes = Array.from(makeWav(2, 22050, 2));
  const data = await page.evaluateHandle((bytes) => {
    const transfer = new DataTransfer();
    transfer.items.add(
      new File([new Uint8Array(bytes)], "Stereo.WAV", { type: "audio/wav" }),
    );
    return transfer;
  }, bytes);
  await page
    .locator(".drop-zone")
    .dispatchEvent("dragenter", { dataTransfer: data });
  await expect(page.locator(".drop-zone")).toHaveClass(/dragging/);
  await page
    .locator(".drop-zone")
    .dispatchEvent("drop", { dataTransfer: data });
  await expect(page.locator(".filename")).toHaveText("Stereo.WAV");
  await expect(page.getByText("Stereo", { exact: true })).toBeVisible();
  expect(
    await page.locator(".waveform rect").first().getAttribute("height"),
  ).not.toBe("2");
});

test("unsupported, empty, corrupt, multiple, large, and long imports recover without losing existing audio", async ({
  page,
}) => {
  await page.goto("./");
  await page.getByLabel("음악 파일 선택", { exact: true }).setInputFiles(wav);
  await expect(page.locator(".filename")).toHaveText(wav.name);
  const invalidFiles = [
    {
      name: "bad.mp4",
      mimeType: "video/mp4",
      buffer: Buffer.from("unsupported"),
    },
    { name: "empty.wav", mimeType: "audio/wav", buffer: Buffer.alloc(0) },
    {
      name: "corrupt.mp3",
      mimeType: "audio/mpeg",
      buffer: Buffer.from("not music"),
    },

    {
      name: "long.wav",
      mimeType: "audio/wav",
      buffer: makeWav(601, 8000, 1, true),
    },
  ];
  for (const file of invalidFiles) {
    await page
      .getByLabel("음악 파일 선택", { exact: true })
      .setInputFiles(file);
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.locator(".filename")).toHaveText(wav.name);
    await expect(
      page.getByRole("button", { name: "파일 선택", exact: true }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "오류 메시지 닫기" }).click();
  }
  const largeDrop = await page.evaluateHandle(() => {
    const transfer = new DataTransfer();
    transfer.items.add(
      new File([new Uint8Array(50 * 1024 * 1024 + 1)], "large.mp3", {
        type: "audio/mpeg",
      }),
    );
    return transfer;
  });
  await page
    .locator(".drop-zone")
    .dispatchEvent("drop", { dataTransfer: largeDrop });
  await expect(page.getByRole("alert")).toContainText("50 MB");
  await expect(page.locator(".filename")).toHaveText(wav.name);
  await page.getByRole("button", { name: "오류 메시지 닫기" }).click();
  const data = await page.evaluateHandle(() => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(["a"], "one.wav"));
    transfer.items.add(new File(["b"], "two.wav"));
    return transfer;
  });
  await page
    .locator(".drop-zone")
    .dispatchEvent("drop", { dataTransfer: data });
  await expect(page.getByRole("alert")).toContainText("하나의 음악 파일");
  await page.getByLabel("음악 파일 선택", { exact: true }).setInputFiles(mp3);
  await expect(page.locator(".filename")).toHaveText(mp3.name);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("worker failure displays a recoverable error", async ({ page }) => {
  await page.addInitScript(() => {
    window.Worker = class {
      constructor() {
        throw new Error("Worker unavailable");
      }
    } as unknown as typeof Worker;
  });
  await page.goto("./");
  await page.getByLabel("음악 파일 선택", { exact: true }).setInputFiles(wav);
  await expect(page.getByRole("alert")).toContainText(
    "파형 작업을 시작할 수 없습니다",
  );
  await expect(
    page.getByRole("button", { name: "파일 선택", exact: true }),
  ).toBeEnabled();
});

test("mobile layout fits, refresh under project subpath works, no fake analysis", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "파일 선택", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".metric strong").first()).toHaveText("—");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/mobile-home.png",
    fullPage: true,
  });
});
