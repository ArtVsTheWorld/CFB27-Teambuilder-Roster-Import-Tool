import fs from "node:fs";
import path from "node:path";

function shortTimestamp(date) {
  const two = (value) => String(value).padStart(2, "0");
  return [
    two(date.getMonth() + 1),
    two(date.getDate()),
    two(date.getHours()),
    two(date.getMinutes()),
  ].join("");
}

function safeOriginalName(savePath) {
  const filename = path.parse(path.basename(savePath)).name;
  const withoutPrefix = filename.replace(/^DYNASTY-/i, "");
  return withoutPrefix.replace(/[^A-Za-z0-9]/g, "").slice(0, 12) || "Save";
}

export function backupFilename(savePath, date = new Date(), suffix = "") {
  return `DYNASTY-${safeOriginalName(savePath)}B${shortTimestamp(date)}${suffix}`;
}

// Keep the game's required DYNASTY- prefix and a recognizable, sanitized piece
// of the original name. Everything after the prefix is ASCII letters/numbers.
export function createBackup(savePath, date = new Date()) {
  const directory = path.dirname(savePath);
  const base = backupFilename(savePath, date);
  let candidate = path.join(directory, base);
  let counter = 1;
  while (fs.existsSync(candidate)) {
    candidate = path.join(directory, `${base}${counter}`);
    counter += 1;
  }
  fs.copyFileSync(savePath, candidate, fs.constants.COPYFILE_EXCL);
  return candidate;
}
