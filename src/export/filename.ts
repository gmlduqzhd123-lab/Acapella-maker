export function exportTitle(filename: string) {
  return filename.replace(/\.(wav|mp3)$/i, "") || "AcaScore";
}
export function exportFilename(title: string, extension: "mid" | "nwctxt") {
  let safe = title
    // Remove Windows filename controls deliberately, not an accidental regex range.
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, "")
    .replace(/[. ]+$/g, "")
    .trim()
    .slice(0, 120)
    .replace(/[. ]+$/g, "");
  if (!safe) safe = "AcaScore";
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(safe))
    safe = `_${safe}`;
  return `${safe}.${extension}`;
}
