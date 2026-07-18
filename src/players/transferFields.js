import { createHash } from "node:crypto";
import {
  PRESERVED_FIELDS,
  SPECIAL_PLACEHOLDER_FIELDS,
  TRANSFER_FIELDS,
} from "../config/transferFields.js";
import { hasRecordField, recordFieldNames } from "../save/findPlayerTable.js";

function comparable(value) {
  if (value === undefined) return "__undefined__";
  if (typeof value === "bigint") return value.toString();
  if (value && typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return value;
}

export function valuesEqual(left, right) {
  return comparable(left) === comparable(right);
}

export function resolveTransferFields(sourceRecords, targetRecords) {
  const sourceFields = new Set(sourceRecords.flatMap(recordFieldNames));
  const targetFields = new Set(targetRecords.flatMap(recordFieldNames));
  const available = TRANSFER_FIELDS.filter(
    (field) => sourceFields.has(field) && targetFields.has(field),
  );
  const missing = TRANSFER_FIELDS.filter(
    (field) => !sourceFields.has(field) || !targetFields.has(field),
  ).map((field) => ({
    field,
    missingFromSource: !sourceFields.has(field),
    missingFromTarget: !targetFields.has(field),
  }));
  return { available, missing };
}

export function createTransferPlan(matches, targetTeamIndex, fields) {
  return matches.map((match) => {
    const changes = [];
    for (const field of fields) {
      const before = match.target.record[field];
      const after = match.source.record[field];
      if (!valuesEqual(before, after)) changes.push({ field, before, after });
    }
    if (match.targetIsPlaceholder) {
      const before = match.target.record.TeamIndex;
      if (!valuesEqual(before, targetTeamIndex)) {
        changes.push({ field: "TeamIndex", before, after: targetTeamIndex, placeholderAssignment: true });
      }
    }
    return { ...match, targetTeamIndex, changes };
  });
}

export function applyTransferPlan(plan) {
  const applied = [];
  try {
    for (const replacement of plan) {
      for (const change of replacement.changes) {
        if (!hasRecordField(replacement.target.record, change.field)) {
          throw new Error(
            `Target record ${replacement.targetRecordIndex} lacks field ${change.field}.`,
          );
        }
        replacement.target.record[change.field] = change.after;
        if (!valuesEqual(replacement.target.record[change.field], change.after)) {
          throw new Error(
            `Field ${change.field} did not retain its assigned value on target record ${replacement.targetRecordIndex}.`,
          );
        }
        applied.push({ record: replacement.target.record, change });
      }
    }
  } catch (error) {
    for (const { record, change } of applied.reverse()) record[change.field] = change.before;
    throw error;
  }
}

export function rollbackTransferPlan(plan) {
  for (const replacement of [...plan].reverse()) {
    for (const change of [...replacement.changes].reverse()) {
      replacement.target.record[change.field] = change.before;
    }
  }
}

export function fingerprintRecord(record, fieldNames = recordFieldNames(record)) {
  const hash = createHash("sha256");
  // Franchise records lazily decode and cache every field value. Reading all ~282
  // fields across ~16,000 untouched players can exhaust Node's heap while two saves
  // are open. The raw record buffer is both stricter and dramatically cheaper.
  if (Buffer.isBuffer(record?.data)) {
    hash.update(record.data);
    hash.update(`isEmpty=${record.isEmpty};index=${record.index}`);
    return hash.digest("hex");
  }
  for (const field of fieldNames) {
    hash.update(field);
    hash.update("\0");
    hash.update(String(comparable(record[field])));
    hash.update("\0");
  }
  hash.update(`isEmpty=${record.isEmpty};index=${record.index}`);
  return hash.digest("hex");
}

export function captureValidationBaseline(table, plan) {
  const records = table.records;
  const fieldNames = recordFieldNames(records.find((record) => !record.isEmpty));
  const modifiedIndices = new Set(plan.map((replacement) => replacement.targetRecordIndex));
  const untouchedFingerprints = new Map();
  records.forEach((record, arrayIndex) => {
    const index = Number.isInteger(record.index) ? record.index : arrayIndex;
    if (!modifiedIndices.has(index)) {
      untouchedFingerprints.set(index, fingerprintRecord(record, fieldNames));
    }
  });
  const protectedValues = new Map(
    plan.map((replacement) => {
      const changedFields = new Set(replacement.changes.map((change) => change.field));
      return [
        replacement.targetRecordIndex,
        Object.fromEntries(
          fieldNames
            .filter((field) => !changedFields.has(field))
            .map((field) => [field, replacement.target.record[field]]),
        ),
      ];
    }),
  );
  return {
    recordCount: records.length,
    validRecordCount: records.filter((record) => !record.isEmpty).length,
    fieldNames,
    untouchedFingerprints,
    protectedValues,
    modifiedIndices,
  };
}

export { PRESERVED_FIELDS, SPECIAL_PLACEHOLDER_FIELDS, TRANSFER_FIELDS };
