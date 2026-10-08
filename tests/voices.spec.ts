import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import MidiPackage from "@tonejs/midi";
import { pcmWav, pitchTrack } from "./musicSignals";
import { satbAudio, assignmentAccuracy } from "./voiceSignals";
import { VOICES, VOICE_NAMES } from "../src/voices/types";
test.use({ hasTouch: true });
async function analyze(page: Page, buffer: Buffer, name: string) {
  await page.goto("./");
  await page.getByRole("button", { name: "고급 편집", exact: true }).click();
  await page
    .getByLabel("음악 파일 선택", { exact: true })
    .setInputFiles({ name, mimeType: "audio/wav", buffer });
  await page
    .getByRole("button", { name: "음악 분석 시작", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText("음악 분석 완료", {
    timeout: 160000,
  });
  await page.setViewportSize({ width: 2200, height: 1500 });
  await page.getByRole("tab", { name: "Piano Roll", exact: true }).click();
  await page.getByRole("button", { name: "전체 보기", exact: true }).click();
  await page.getByRole("button", { name: "BPM 수정", exact: true }).click();
  await page.getByLabel("사용할 BPM", { exact: true }).fill("120");
  await page.getByRole("button", { name: "BPM 적용", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "SATB 성부 분석", exact: true }),
  ).toBeDisabled();
  await apply(page);
  await page
    .getByRole("button", { name: "SATB 성부 분석", exact: true })
    .click();
  await expect(page.getByTestId("voice-count-soprano")).toBeVisible({
    timeout: 30000,
  });
}
async function apply(page: Page) {
  await page
    .getByRole("button", { name: "Quantization 미리보기", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Quantization 적용", exact: true })
    .click();
}
async function rerun(page: Page) {
  await page
    .getByRole("button", { name: "성부 분석 다시 하기", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "성부 분석 다시 하기", exact: true }),
  ).toBeEnabled({ timeout: 30000 });
  await expect(page.getByTestId("voice-count-soprano")).toBeVisible({
    timeout: 30000,
  });
}
async function visibleNotes(page: Page) {
  return page.locator(".pr-note").evaluateAll((els) =>
    els.map((el) => ({
      id: el.getAttribute("data-note-id")!,
      start: Number(el.getAttribute("data-start")),
      duration: Number(el.getAttribute("data-duration")),
      midi: Number(el.getAttribute("data-midi")),
      velocity: Number(el.getAttribute("data-velocity")),
      confidence: Number(el.getAttribute("data-confidence")),
      voice: el.getAttribute("data-voice")!,
    })),
  );
}
test("actual four-bar SATB oscillator PCM → Basic Pitch → quantization → voice accuracy/manual/filter/stale/guide/MIDI/NWCTXT/mobile", async ({
  page,
}) => {
  test.setTimeout(360000);
  const external: string[] = [],
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (
      r.url().startsWith("http") &&
      (new URL(r.url()).origin !==
        new URL(process.env.TEST_BASE_URL ?? "http://127.0.0.1:4173").origin ||
        r.method() !== "GET")
    )
      external.push(r.url());
  });
  const { input, truth } = satbAudio();
  await analyze(page, pcmWav(input), "satb-real.wav");
  const notes = await visibleNotes(page),
    metrics = assignmentAccuracy(notes, truth);
  const counts: Record<string, number> = Object.fromEntries(
    await Promise.all(
      [...VOICES, "unassigned" as const].map(async (v) => [
        v,
        Number(
          (await page.getByTestId(`voice-count-${v}`).textContent())!.replace(
            "개",
            "",
          ),
        ),
      ]),
    ),
  );
  console.log(JSON.stringify({ actualSatb: true, metrics, counts, notes }));
  // Initial acceptance threshold is explicit and below perfect accuracy. Raw
  // detections/harmonics aren't relabelled or matched by loose pitch tolerance.
  expect(metrics.matched).toBeGreaterThanOrEqual(24);
  expect(metrics.accuracy).toBeGreaterThanOrEqual(0.85);
  expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(notes.length);
  for (const v of VOICES) expect(counts[v]).toBeGreaterThan(0);
  for (const v of VOICES) {
    await page
      .getByRole("group", { name: "성부 보기" })
      .getByRole("button", {
        name: { soprano: "S", alto: "A", tenor: "T", bass: "B" }[v],
        exact: true,
      })
      .click();
    expect((await visibleNotes(page)).every((n) => n.voice === v)).toBe(true);
  }
  await page
    .getByRole("group", { name: "성부 보기" })
    .getByRole("button", { name: "전체", exact: true })
    .click();
  const chosen = page.locator('.pr-note[data-voice="soprano"]').first(),
    chosenId = await chosen.getAttribute("data-note-id");
  await chosen.click();
  await page
    .getByLabel("선택 음표 성부", { exact: true })
    .selectOption("unassigned");
  await expect(page.getByText("직접 지정", { exact: true })).toBeVisible();
  await rerun(page);
  expect(
    await page
      .locator(`.pr-note[data-note-id="${chosenId}"]`)
      .getAttribute("data-voice"),
  ).toBe("unassigned");
  const exportPanel = page.getByRole("region", { name: "악보 내보내기" });
  await exportPanel.getByLabel("SATB 성부", { exact: true }).check();
  await expect(
    exportPanel.getByRole("button", { name: "MIDI 다운로드", exact: true }),
  ).toBeDisabled();
  await exportPanel
    .getByLabel("미분류 음표 제외하고 내보내기", { exact: true })
    .check();
  // Restore the manual note to its real assigned part, retaining all detections.
  await page.locator(`.pr-note[data-note-id="${chosenId}"]`).click();
  await page
    .getByLabel("선택 음표 성부", { exact: true })
    .selectOption("soprano");
  const current = await visibleNotes(page),
    assigned = current.filter((n) => n.voice !== "unassigned");
  const midiEvent = page.waitForEvent("download");
  await exportPanel
    .getByRole("button", { name: "MIDI 다운로드", exact: true })
    .click();
  const midiDownload = await midiEvent,
    bytes = await readFile((await midiDownload.path())!);
  const midi = new MidiPackage.Midi(bytes);
  expect(midiDownload.suggestedFilename()).toBe("satb-real.mid");
  expect(midi.tracks.map((t) => t.name)).toEqual([
    "Soprano",
    "Alto",
    "Tenor",
    "Bass",
  ]);
  expect(new Set(midi.tracks.map((t) => t.channel)).size).toBe(4);
  for (const voice of VOICES) {
    const track = midi.tracks.find((t) => t.name === VOICE_NAMES[voice])!,
      expected = assigned
        .filter((n) => n.voice === voice)
        .sort((a, b) => a.start - b.start || a.midi - b.midi);
    expect(track.notes.length).toBe(expected.length);
    expected.forEach((n, i) => {
      expect(track.notes[i].midi).toBe(n.midi);
      expect(Math.abs(track.notes[i].time - n.start)).toBeLessThan(0.001);
      expect(Math.abs(track.notes[i].duration - n.duration)).toBeLessThan(
        0.001,
      );
    });
  }
  await writeFile("test-results/satb-real.mid", bytes);
  const nwcEvent = page.waitForEvent("download");
  await exportPanel
    .getByRole("button", { name: "NWC 악보 받기 · Beta", exact: true })
    .click();
  const nwcDownload = await nwcEvent,
    text = await readFile((await nwcDownload.path())!, "utf8");
  expect(text).not.toContain("Draft Voice");
  for (const name of ["Soprano", "Alto", "Tenor", "Bass"])
    expect(text).toContain(`|AddStaff|Name:"${name}"`);
  expect(text.match(/\|Clef\|Type:Treble/g)?.length).toBe(3);
  expect(text.match(/\|Clef\|Type:Bass/g)?.length).toBe(1);
  await writeFile("test-results/satb-real.nwctxt", text, "utf8");
  await page
    .getByRole("button", { name: "SATB 전체 재생", exact: true })
    .click();
  await expect(page.getByTestId("guide-position")).toContainText("재생 중");
  await page.waitForTimeout(250);
  const pos = await page.getByTestId("guide-position").textContent();
  expect(Number(/([\d.]+)초/.exec(pos!)![1])).toBeGreaterThan(0.1);
  await page.getByRole("button", { name: "가이드 정지", exact: true }).click();
  await expect(page.getByTestId("guide-position")).toHaveText("정지");
  await page.getByRole("button", { name: "alto Solo", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "alto Solo", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "bass Mute", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "bass Mute", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({
    path: "test-results/voices-desktop.png",
    fullPage: true,
  });
  await page.locator(`.pr-note[data-note-id="${chosenId}"]`).click();
  await page.getByLabel("MIDI 음높이", { exact: true }).fill("70");
  await expect(
    page.getByText("성부 분석을 다시 실행해 주세요.", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    exportPanel.getByRole("button", { name: "MIDI 다운로드", exact: true }),
  ).toBeDisabled();
  await apply(page);
  await rerun(page);
  expect(
    await page
      .locator(`.pr-note[data-note-id="${chosenId}"]`)
      .getAttribute("data-voice"),
  ).toBe("soprano");
  // Batch correction is explicit, may create overlap, and must block SATB only.
  await page
    .getByText("시간 구간·현재 성부 필터로 일괄 지정", { exact: true })
    .click();
  await page.getByLabel("일괄 지정 시작", { exact: true }).fill("0");
  await page.getByLabel("일괄 지정 끝", { exact: true }).fill("9");
  await page.getByLabel("일괄 지정 성부", { exact: true }).selectOption("alto");
  await page
    .getByRole("button", { name: "구간 성부 지정", exact: true })
    .click();
  await expect(
    exportPanel.getByRole("button", { name: "MIDI 다운로드", exact: true }),
  ).toBeDisabled();
  await exportPanel.getByLabel("Draft Voice", { exact: true }).check();
  await expect(
    exportPanel.getByRole("button", { name: "MIDI 다운로드", exact: true }),
  ).toBeEnabled();
  await page.getByLabel("직접 지정한 성부 유지", { exact: true }).uncheck();
  await rerun(page);
  for (const v of VOICES)
    expect(
      Number(
        (await page.getByTestId(`voice-count-${v}`).textContent())!.replace(
          "개",
          "",
        ),
      ),
    ).toBeGreaterThan(0);
  await page.setViewportSize({ width: 390, height: 844 });
  // Selected ID remains mounted across viewport virtualization updates.
  const mobileNote = page.locator(`.pr-note[data-note-id="${chosenId}"]`);
  await mobileNote.tap();
  await expect(
    page.getByLabel("선택 음표 성부", { exact: true }),
  ).toBeEnabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/voices-mobile.png",
    fullPage: true,
  });
  console.log(
    JSON.stringify({
      actualSatbExports: true,
      midiBytes: bytes.length,
      nwctxtBytes: Buffer.byteLength(text),
      tracks: midi.tracks.map((t) => ({
        name: t.name,
        notes: t.notes.length,
        channel: t.channel,
      })),
      manualRetained: true,
      staleBlocked: true,
      overlapBlocked: true,
      draftFallback: true,
      guide: true,
      mobile: true,
    }),
  );
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});
test("actual existing polyphonic C-major Basic Pitch audio → SATB without fabricating missing notes", async ({
  page,
}) => {
  test.setTimeout(360000);
  await analyze(page, pcmWav(pitchTrack(6, true)), "satb-chord.wav");
  const notes = await visibleNotes(page);
  expect(notes.some((n) => n.midi === 60)).toBe(true);
  expect(notes.some((n) => n.midi === 64)).toBe(true);
  expect(notes.some((n) => n.midi === 67)).toBe(true);
  const total = await page
    .locator(".voice-summary [data-testid]")
    .allTextContents();
  expect(total.reduce((sum, t) => sum + Number(t.replace("개", "")), 0)).toBe(
    notes.length,
  );
  console.log(
    JSON.stringify({
      actualChordVoiceAssignment: true,
      notes: notes.length,
      counts: total,
    }),
  );
});
