import fs from "node:fs";
import path from "node:path";

export function normalizeDroppedPath(value) {
  let result = String(value ?? "").trim();
  while (
    result.length >= 2 &&
    ((result.startsWith('"') && result.endsWith('"')) ||
      (result.startsWith("'") && result.endsWith("'")))
  ) {
    result = result.slice(1, -1).trim();
  }
  return path.resolve(result);
}

export function isExistingFile(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

export function filenameHasPrefix(filePath, prefix) {
  return path.basename(filePath).toUpperCase().startsWith(prefix.toUpperCase());
}

export function compactTimestamp(date = new Date()) {
  const two = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    two(date.getMonth() + 1),
    two(date.getDate()),
    "-",
    two(date.getHours()),
    two(date.getMinutes()),
    two(date.getSeconds()),
  ].join("");
}

export function ensureDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true });
  return directory;
}

export function uniquePath(candidate) {
  if (!fs.existsSync(candidate)) return candidate;
  const parsed = path.parse(candidate);
  let suffix = 1;
  let next;
  do {
    next = path.join(parsed.dir, `${parsed.name}-${suffix}${parsed.ext}`);
    suffix += 1;
  } while (fs.existsSync(next));
  return next;
}

export function sleep(milliseconds = 12) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
