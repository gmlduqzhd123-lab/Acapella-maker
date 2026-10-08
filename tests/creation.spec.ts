import { test, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { pitchTrack, pcmWav } from "./musicSignals";
import { makeMp3 } from "./fixtures";
test.use({ hasTouch: true });
test("simple default flow, five/six target roles and mobile layout; no YouTube or fake generated parts", async ({
  page,
}) => {
  await page.goto("./");
  await expect(
    page.getByRole("button", { name: "악보 초안 만들기", exact: true }),
  ).toBeDisabled();
  const parts = page.getByRole("list", { name: "목표 파트 구성" });
  await expect(parts.getByRole("listitem")).toHaveCount(5);
  await expect(parts).toContainText("보컬 퍼커션");
  await page.getByLabel("노래할 인원", { exact: true }).selectOption("6");
  await page
    .getByLabel("1번 파트", { exact: true })
    .selectOption("countertenor");
  await page.getByLabel("2번 파트", { exact: true }).selectOption("tenor");
  await expect(parts.getByRole("listitem")).toHaveCount(6);
  await expect(parts).toContainText("카운터테너");
  await expect(parts).toContainText("추가 보컬");
  await expect(
    page.getByText(/현재 다운로드는 검출 음표의 Draft Voice/),
  ).toBeVisible();
  await expect(
    page.getByRole("tab", { name: "Piano Roll", exact: true }),
  ).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/creation-mobile.png",
    fullPage: true,
  });
  await page.getByLabel("노래할 인원", { exact: true }).selectOption("5");
  await expect(parts.getByRole("listitem")).toHaveCount(5);
});
for (const format of ["wav", "mp3"] as const)
  test(`actual ${format} simple one-click inference → automatic rhythm → NWCTXT, original playback and advanced edit protection`, async ({
    page,
  }) => {
    test.setTimeout(360000);
    const errors: string[] = [],
      external: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (r) => {
      if (
        r.url().startsWith("http") &&
        (r.method() !== "GET" ||
          new URL(r.url()).origin !==
            new URL(process.env.TEST_BASE_URL ?? "http://127.0.0.1:4173")
              .origin)
      )
        external.push(r.url());
    });
    await page.goto("./");
    await page.getByLabel("노래할 인원", { exact: true }).selectOption("6");
    const input = pitchTrack(),
      buffer =
        format === "wav"
          ? pcmWav(input)
          : makeMp3(input.samples, input.sampleRate);
    await page
      .getByLabel("음악 파일 선택", { exact: true })
      .setInputFiles({
        name: `simple.${format}`,
        mimeType: format === "wav" ? "audio/wav" : "audio/mpeg",
        buffer,
      });
    await page.getByRole("button", { name: "원본 듣기", exact: true }).click();
    await expect
      .poll(() =>
        page
          .locator("audio")
          .evaluate((el: HTMLAudioElement) => el.currentTime),
      )
      .toBeGreaterThan(0.1);
    await page
      .getByRole("button", { name: "원본 일시정지", exact: true })
      .click();
    await page
      .getByRole("button", { name: "악보 초안 만들기", exact: true })
      .click();
    await expect(page.getByRole("status")).toHaveText(
      /음표 초안 준비 완료|곡의 빠르기를 확인해 주세요/,
      { timeout: 160000 },
    );
    const manualTempo = await page
      .getByLabel("초안 BPM", { exact: true })
      .count();
    if (manualTempo) {
      await page.getByLabel("초안 BPM", { exact: true }).fill("120");
      await page
        .getByRole("button", { name: "BPM 적용하고 계속", exact: true })
        .click();
    }
    await expect(page.getByRole("status")).toHaveText("음표 초안 준비 완료", {
      timeout: 15000,
    });
    const count = Number(
      await page.getByTestId("quick-note-count").textContent(),
    );
    expect(count).toBeGreaterThanOrEqual(4);
    const downloadEvent = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "NWC에서 열 악보 받기", exact: true })
      .click();
    const download = await downloadEvent,
      text = await readFile((await download.path())!, "utf8");
    expect(download.suggestedFilename()).toBe("simple.nwctxt");
    expect(text).toContain("!NoteWorthyComposer(2.75)");
    expect(text).toContain("Draft Voice");
    expect(text).toContain("|Note|");
    await writeFile(`test-results/simple-${format}.nwctxt`, text);
    await page.screenshot({
      path: `test-results/creation-${format}-desktop.png`,
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "음표 수정하기", exact: true })
      .click();
    await expect(
      page.getByRole("tab", { name: "Piano Roll", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await page.getByRole("button", { name: "전체 보기", exact: true }).click();
    const note = page.locator(".pr-note").first();
    await note.click();
    const oldMidi = Number(await note.getAttribute("data-midi"));
    await page
      .getByLabel("MIDI 음높이", { exact: true })
      .fill(String(oldMidi + 1));
    await page.getByRole("button", { name: "간편 화면", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "NWC에서 열 악보 받기", exact: true }),
    ).toBeDisabled();
    await page
      .getByRole("button", { name: "악보 초안 만들기", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "취소", exact: true }).click();
    await expect(page.getByTestId("quick-note-count")).toHaveText(
      String(count),
    );
    expect(external).toEqual([]);
    expect(errors).toEqual([]);
    console.log(
      JSON.stringify({
        quickDraft: true,
        format,
        notes: count,
        manualTempo,
        nwctxtBytes: Buffer.byteLength(text),
        team: 6,
        generatedTeamParts: false,
        advancedEditStale: true,
        noUploads: true,
      }),
    );
  });
test("simple generation cancel and file removal discard late model work", async ({
  page,
}) => {
  test.setTimeout(180000);
  await page.route("**/models/basic-pitch/model.json", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.abort();
  });
  await page.goto("./");
  await page
    .getByLabel("음악 파일 선택", { exact: true })
    .setInputFiles({
      name: "cancel.wav",
      mimeType: "audio/wav",
      buffer: pcmWav(pitchTrack(4)),
    });
  await page
    .getByRole("button", { name: "악보 초안 만들기", exact: true })
    .click();
  await page
    .getByRole("button", { name: "초안 생성 취소", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText(
    "초안 생성을 취소했습니다.",
  );
  await page.getByRole("button", { name: "파일 제거", exact: true }).click();
  await page.waitForTimeout(1600);
  await expect(
    page.getByRole("button", { name: "악보 초안 만들기", exact: true }),
  ).toBeDisabled();
  await expect(page.getByTestId("quick-note-count")).toHaveCount(0);
});
