import fs from "node:fs";
import path from "node:path";
import { openSave } from "./openSave.js";
import { readPlayerTable } from "./findPlayerTable.js";
import { compactTimestamp, uniquePath } from "../utils/paths.js";

export async function serializeAndVerify(franchise, dynastyPath, expectedRecordCount) {
  const parsed = path.parse(dynastyPath);
  const tempPath = uniquePath(
    path.join(
      parsed.dir,
      `${parsed.name}.transfer-${compactTimestamp()}${parsed.ext || ".tmp"}`,
    ),
  );

  try {
    await franchise.save(tempPath);
    if (!fs.existsSync(tempPath) || fs.statSync(tempPath).size === 0) {
      throw new Error("madden-franchise did not produce a nonempty output file.");
    }
    const verificationSave = await openSave(tempPath);
    const verificationTable = await readPlayerTable(verificationSave);
    if (verificationTable.records.length !== expectedRecordCount) {
      throw new Error(
        `Serialized record count changed from ${expectedRecordCount} to ${verificationTable.records.length}.`,
      );
    }
    return { tempPath, verificationSave, verificationTable };
  } catch (error) {
    if (fs.existsSync(tempPath)) fs.rmSync(tempPath, { force: true });
    throw error;
  }
}

// The fully serialized and reopened temp save is swapped in only after all checks
// pass. A rollback rename protects the original path if the final rename fails.
export function replaceOriginalWithVerifiedTemp(tempPath, dynastyPath) {
  const rollbackPath = uniquePath(`${dynastyPath}.pre-swap`);
  fs.renameSync(dynastyPath, rollbackPath);
  try {
    fs.renameSync(tempPath, dynastyPath);
    fs.rmSync(rollbackPath, { force: true });
  } catch (error) {
    if (fs.existsSync(dynastyPath)) fs.rmSync(dynastyPath, { force: true });
    fs.renameSync(rollbackPath, dynastyPath);
    throw error;
  }
}
