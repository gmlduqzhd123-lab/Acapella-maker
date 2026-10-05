import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import MidiPackage from "@tonejs/midi";
import { pitchTrack, pcmWav } from "./musicSignals";
import { fixtureSnapshot, exportSettings } from "./exportFixtures";
import { buildNwcDocument } from "../src/export/nwctxt/exporter";
import { validateNwctxt } from "../src/export/nwctxt/validator";
const { Midi } = MidiPackage;
test.use({ hasTouch: true });
async function bpm(page: Page, value: number) {
  await page.getByRole("button", { name: "BPM 수정", exact: true }).click();
  await page.getByLabel("사용할 BPM", { exact: true }).fill(String(value));
  await page.getByRole("button", { name: "BPM 적용", exact: true }).click();
}
test("actual Basic Pitch WAV → edited WorkingNotes → applied quantization → actual MIDI/NWCTXT downloads, stale locks and mobile", async ({
  page,
}) => {
  test.setTimeout(360_000);
  const external: string[] = [],
    errors: string[] = [];
  page.on("request", (r) => {
    if (
      r.url().startsWith("http") &&
      (new URL(r.url()).origin !==
        new URL(process.env.TEST_BASE_URL ?? "http://127.0.0.1:4173").origin ||
        r.method() !== "GET")
    )
      external.push(r.url());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("./");
  await page.getByLabel("음악 파일 선택", { exact: true }).setInputFiles({
    name: "export-real.wav",
    mimeType: "audio/wav",
    buffer: pcmWav(pitchTrack()),
  });
  await page
    .getByRole("button", { name: "음악 분석 시작", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText("음악 분석 완료", {
    timeout: 160_000,
  });
  await page.setViewportSize({ width: 2200, height: 1400 });
  await page.getByRole("tab", { name: "Piano Roll", exact: true }).click();
  await page.getByRole("button", { name: "전체 보기", exact: true }).click();
  await expect(page.locator(".pr-note")).toHaveCount(5);
  for (const midi of [60, 64, 67, 72])
    await expect(
      page.locator(`.pr-note[data-midi="${midi}"]`).first(),
    ).toBeVisible();
  const midiButton = page.getByRole("button", {
    name: "MIDI 다운로드",
    exact: true,
  });
  const nwcButton = page.getByRole("button", {
    name: "NWC 악보 받기 · Beta",
    exact: true,
  });
  const preview = page.getByRole("button", {
    name: "Quantization 미리보기",
    exact: true,
  });
  const apply = page.getByRole("button", {
    name: "Quantization 적용",
    exact: true,
  });
  await expect(midiButton).toBeDisabled();
  await expect(nwcButton).toBeDisabled();
  await bpm(page, 120);
  await page.getByRole("button", { name: "Key 수정", exact: true }).click();
  await page.getByLabel("Key Root", { exact: true }).selectOption("0");
  await page.getByLabel("Key Mode", { exact: true }).selectOption("major");
  await page.getByRole("button", { name: "Key 적용", exact: true }).click();
  await preview.click();
  await expect(midiButton).toBeDisabled();
  await apply.click();
  await expect(midiButton).toBeEnabled();
  await expect(nwcButton).toBeEnabled();
  const first = page.locator('.pr-note[data-midi="60"]').first();
  const firstId = await first.getAttribute("data-note-id");
  await first.click();
  await page.getByLabel("MIDI 음높이", { exact: true }).fill("62");
  await expect(midiButton).toBeDisabled();
  await expect(nwcButton).toBeDisabled();
  await expect(
    page.getByText("현재 편집 내용에 맞게 박자 정리를 다시 적용해 주세요.", {
      exact: true,
    }),
  ).toBeVisible();
  await preview.click();
  await apply.click();
  // Read actual inferred/edited notes from the UI, never inject NoteEvents into the app.
  const notes = await page.locator(".pr-note").evaluateAll((elements) =>
    elements.map((el) => ({
      id: el.getAttribute("data-note-id")!,
      midi: Number(el.getAttribute("data-midi")),
      start: Number(el.getAttribute("data-start")),
      duration: Number(el.getAttribute("data-duration")),
      velocity: 100,
      confidence: 0.8,
    })),
  );
  expect(notes.find((n) => n.id === firstId)?.midi).toBe(62);
  const downloadMidiEvent = page.waitForEvent("download");
  await midiButton.click();
  const midiDownload = await downloadMidiEvent;
  expect(midiDownload.suggestedFilename()).toBe("export-real.mid");
  const bytes = await readFile((await midiDownload.path())!);
  expect(bytes.subarray(0, 4).toString()).toBe("MThd");
  const parsed = new Midi(bytes);
  expect(parsed.header.ppq).toBe(960);
  expect(parsed.header.tempos[0].bpm).toBeCloseTo(120, 4);
  expect(parsed.header.timeSignatures[0].timeSignature).toEqual([4, 4]);
  const midiNotes = parsed.tracks
    .flatMap((t) => t.notes)
    .sort((a, b) => a.time - b.time || a.midi - b.midi);
  const expected = [...notes].sort(
    (a, b) => a.start - b.start || a.midi - b.midi,
  );
  expect(midiNotes).toHaveLength(notes.length);
  expected.forEach((n, i) => {
    expect(midiNotes[i].midi).toBe(n.midi);
    expect(Math.abs(midiNotes[i].time - n.start)).toBeLessThan(0.001);
    expect(Math.abs(midiNotes[i].duration - n.duration)).toBeLessThan(0.001);
  });
  await writeFile("test-results/export-real.mid", bytes);
  const downloadNwcEvent = page.waitForEvent("download");
  await nwcButton.click();
  const nwcDownload = await downloadNwcEvent;
  expect(nwcDownload.suggestedFilename()).toBe("export-real.nwctxt");
  const text = await readFile((await nwcDownload.path())!, "utf8");
  expect(text).toMatch(/^!NoteWorthyComposer\(2\.75\)/);
  expect(text.trim()).toMatch(/!NoteWorthyComposer-End$/);
  expect(text).toContain('|AddStaff|Name:"Draft Voice 1"');
  // Reconstruct ONLY the independent expected document from the real UI values.
  // Velocity/confidence aren't NWC fields; effective C Major was selected above.
  const snapshot = fixtureSnapshot(
    notes,
    exportSettings,
    { tonic: 0, mode: "major", confidence: 0 },
    10,
  );
  snapshot.title = "export-real";
  const nwcDocument = buildNwcDocument(snapshot);
  expect(validateNwctxt(text, nwcDocument, snapshot)).toEqual({
    valid: true,
    errors: [],
  });
  await writeFile("test-results/export-real.nwctxt", text, "utf8");
  console.log(
    JSON.stringify({
      actualPitchExport: true,
      notes: notes.length,
      midiBytes: bytes.length,
      nwctxtBytes: Buffer.byteLength(text),
      report: nwcDocument.report,
      firstEditedMidi: 62,
    }),
  );
  await page.screenshot({
    path: "test-results/export-desktop.png",
    fullPage: true,
  });
  await page.locator(`.pr-note[data-note-id="${firstId}"]`).click();
  await page.getByLabel("길이 (초)", { exact: true }).fill("0.251");
  await page
    .getByLabel("Quantization 강도", { exact: true })
    .selectOption("weak");
  await preview.click();
  await apply.click();
  await expect(midiButton).toBeEnabled();
  await expect(nwcButton).toBeDisabled();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "NWC 음가로 정확하게 표현할 수 없는 음표" }),
  ).toBeVisible();
  await page
    .getByLabel("Quantization 강도", { exact: true })
    .selectOption("standard");
  await preview.click();
  await apply.click();
  await expect(nwcButton).toBeEnabled();
  // Every setting change invalidates the applied result, including meter-only changes.
  for (const [label, value] of [
    ["박자표", "3/4"],
    ["박자표", "6/8"],
    ["BPM 기준", "dottedQuarter"],
    ["최소 단위", "eighth"],
    ["Quantization 강도", "strong"],
  ]) {
    await page.getByLabel(label, { exact: true }).selectOption(value);
    await expect(midiButton).toBeDisabled();
    await expect(nwcButton).toBeDisabled();
    await preview.click();
    await apply.click();
    await expect(midiButton).toBeEnabled();
  }
  await page.getByLabel("1마디 1박 위치", { exact: true }).fill("0.5");
  await expect(midiButton).toBeDisabled();
  await expect(nwcButton).toBeDisabled();
  await preview.click();
  await apply.click();
  await bpm(page, 111);
  await expect(midiButton).toBeDisabled();
  await expect(nwcButton).toBeDisabled();
  await bpm(page, 120);
  await preview.click();
  await apply.click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(nwcButton).toBeEnabled();
  await nwcButton.scrollIntoViewIfNeeded();
  const mobileEvent = page.waitForEvent("download");
  await nwcButton.tap();
  expect((await mobileEvent).suggestedFilename()).toBe("export-real.nwctxt");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/export-mobile.png",
    fullPage: true,
  });
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});
