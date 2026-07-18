import { fingerprintRecord, valuesEqual } from "./transferFields.js";

function recordsByIndex(table) {
  return new Map(
    table.records.map((record, arrayIndex) => [
      Number.isInteger(record.index) ? record.index : arrayIndex,
      record,
    ]),
  );
}

export function validateTransfer({
  table,
  baseline,
  plan,
  transferFields,
  targetTeamIndex,
  includeCreated,
  skippedCreated,
}) {
  const errors = [];
  const checks = [];
  const byIndex = recordsByIndex(table);
  const pass = (name, condition, detail = "") => {
    checks.push({ name, passed: Boolean(condition), detail });
    if (!condition) errors.push(detail || name);
  };

  pass(
    "Player-table record count unchanged",
    table.records.length === baseline.recordCount,
    `Expected ${baseline.recordCount} records; found ${table.records.length}.`,
  );
  pass(
    "Valid record count unchanged",
    table.records.filter((record) => !record.isEmpty).length === baseline.validRecordCount,
    "The number of nonempty player records changed.",
  );

  const sourceIndices = plan.map((replacement) => replacement.sourceRecordIndex);
  const targetIndices = plan.map((replacement) => replacement.targetRecordIndex);
  pass(
    "Each source used at most once",
    new Set(sourceIndices).size === sourceIndices.length,
    "A source player was transferred more than once.",
  );
  pass(
    "Each target used at most once",
    new Set(targetIndices).size === targetIndices.length,
    "A target player was replaced more than once.",
  );
  pass(
    "Replacement count confirmed",
    plan.length === targetIndices.length,
    "Replacement count does not match the confirmed plan.",
  );

  let untouchedOkay = true;
  for (const [index, fingerprint] of baseline.untouchedFingerprints) {
    const record = byIndex.get(index);
    if (!record || fingerprintRecord(record, baseline.fieldNames) !== fingerprint) {
      untouchedOkay = false;
      errors.push(`Untouched player-table record ${index} changed unexpectedly.`);
      break;
    }
  }
  checks.push({ name: "All unselected records unchanged", passed: untouchedOkay });

  let protectedOkay = true;
  let writesOkay = true;
  let teamAssignmentsOkay = true;
  for (const replacement of plan) {
    const record = byIndex.get(replacement.targetRecordIndex);
    const protectedBefore = baseline.protectedValues.get(replacement.targetRecordIndex);
    if (!record || !protectedBefore) {
      protectedOkay = false;
      errors.push(`Target record ${replacement.targetRecordIndex} is missing after transfer.`);
      continue;
    }
    for (const [field, before] of Object.entries(protectedBefore)) {
      if (field === "TeamIndex" && replacement.targetIsPlaceholder) continue;
      if (!valuesEqual(record[field], before)) {
        protectedOkay = false;
        errors.push(`Protected field ${field} changed on target record ${replacement.targetRecordIndex}.`);
      }
    }
    const replacementTargetTeamIndex = replacement.targetTeamIndex ?? targetTeamIndex;
    const expectedTeamIndex = replacement.targetIsPlaceholder
      ? replacementTargetTeamIndex
      : protectedBefore.TeamIndex;
    if (!valuesEqual(record.TeamIndex, expectedTeamIndex)) {
      teamAssignmentsOkay = false;
      errors.push(`TeamIndex validation failed on target record ${replacement.targetRecordIndex}.`);
    }
    for (const field of transferFields) {
      if (!valuesEqual(record[field], replacement.source.record[field])) {
        writesOkay = false;
        errors.push(`Approved field ${field} failed on target record ${replacement.targetRecordIndex}.`);
        break;
      }
    }
  }
  checks.push({ name: "Protected fields preserved", passed: protectedOkay });
  checks.push({ name: "Team assignments valid", passed: teamAssignmentsOkay });
  checks.push({ name: "Required source values written", passed: writesOkay });

  const createdOkay = includeCreated
    ? true
    : plan.every((replacement) => !replacement.source.isCreated) && skippedCreated.every((player) => player.isCreated);
  pass(
    "Created-player selection honored",
    createdOkay,
    "Created-player handling did not match the user's selection.",
  );

  return { passed: errors.length === 0, errors, checks };
}
