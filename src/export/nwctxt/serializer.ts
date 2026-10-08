import type { NwcDocument } from "./types";
/** NWC quoted text uses backslash escapes; pipe is literal INSIDE quotes. */
export function quoteNwcText(text: string) {
  return (
    '"' +
    text
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\r/g, "\\r")
      .replace(/\n/g, "\\n")
      .replace(/\t/g, "\\t")
      // Strip non-printable controls from the text format deliberately.
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "") +
    '"'
  );
}
/** Split delimiters only outside quoted strings, including escaped quotes. */
export function parseNwcLine(line: string) {
  if (!line.startsWith("|"))
    throw new Error("NWCTXT object 구문이 올바르지 않습니다.");
  const fields: string[] = [];
  let field = "",
    quoted = false,
    escaped = false;
  for (const char of line.slice(1)) {
    if (escaped) {
      field += char;
      escaped = false;
      continue;
    }
    if (char === "\\" && quoted) {
      field += char;
      escaped = true;
      continue;
    }
    if (char === '"') quoted = !quoted;
    if (char === "|" && !quoted) {
      fields.push(field);
      field = "";
    } else field += char;
  }
  if (quoted || escaped)
    throw new Error("NWCTXT text 따옴표가 닫히지 않았습니다.");
  fields.push(field);
  const props: Record<string, string> = {};
  for (const field of fields.slice(1)) {
    const colon = field.indexOf(":");
    if (colon < 1) throw new Error("NWCTXT 속성이 올바르지 않습니다.");
    const name = field.slice(0, colon),
      value = field.slice(colon + 1);
    if (name in props) throw new Error("NWCTXT 중복 속성입니다.");
    props[name] = value.startsWith('"') ? (JSON.parse(value) as string) : value;
  }
  return { type: fields[0], props };
}
export function serializeNwc(document: NwcDocument) {
  const lines = [
    "!NoteWorthyComposer(2.75)",
    `|SongInfo|Title:${quoteNwcText(document.title)}`,
  ];
  document.staffs.forEach((staff, index) => {
    lines.push(
      `|AddStaff|Name:${quoteNwcText(staff.name)}|Label:${quoteNwcText(staff.name)}`,
      "|StaffProperties|EndingBar:Section Close|Visible:Y|Lines:5",
      `|StaffProperties|Muted:N|Volume:100|StereoPan:64|Device:0|Channel:${staff.midiChannel ?? index + 1}`,
      ...(staff.instrumentPatch === undefined ? [] : [`|StaffInstrument|Patch:${staff.instrumentPatch}|Trans:0`]),
      `|Clef|Type:${staff.displayClef ?? staff.clef}`,
      `|Key|Signature:${staff.key.signature}|Tonic:${staff.key.tonic}`,
      `|TimeSig|Signature:${document.timeSignature}`,
    );
    if (index === 0)
      lines.push(
        `|Tempo|Base:${document.tempoBase}|Tempo:${document.bpm}|Pos:8`,
      );
    for (const measure of staff.measures) {
      for (const item of measure.items) {
        if (item.label) lines.push(`|Text|Text:${quoteNwcText(item.label)}|Pos:6`);
        const position =
          item.kind === "Rest"
            ? ""
            : "|Pos:" +
              item.pitches
                .map(
                  (pitch) =>
                    `${pitch.accidental}${pitch.pos}${item.tieToNext ? "^" : ""}`,
                )
                .join(",");
        lines.push(`|${item.kind}|Dur:${item.duration}${position}`);
      }
      lines.push("|Bar");
    }
  });
  lines.push("!NoteWorthyComposer-End");
  return lines.join("\r\n") + "\r\n";
}
