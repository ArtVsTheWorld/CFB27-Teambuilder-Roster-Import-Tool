import {
  PLAYER_TABLE_UNIQUE_ID,
  REQUIRED_PLAYER_FIELDS,
} from "../config/constants.js";

export function findTableByUniqueId(franchise, uniqueId) {
  const direct = franchise.getTableByUniqueId?.(uniqueId);
  const table =
    direct ??
    franchise.tables?.find(
      (candidate) =>
        candidate.uniqueId === uniqueId || candidate.header?.uniqueId === uniqueId,
    );
  if (!table) {
    throw new Error(
      `Player table Unique ID ${uniqueId} was not found. This save may use an unsupported schema.`,
    );
  }
  return table;
}

export async function readPlayerTable(franchise) {
  const table = findTableByUniqueId(franchise, PLAYER_TABLE_UNIQUE_ID);
  await table.readRecords();
  validateRequiredFields(table.records.filter((record) => !record.isEmpty));
  return table;
}

export function recordFieldNames(record) {
  return Object.keys(record?.fields ?? {});
}

export function hasRecordField(record, field) {
  return record?.fields?.[field] !== undefined;
}

export function validateRequiredFields(records) {
  if (!records.length) throw new Error("The player table contains no valid records.");
  const available = new Set(records.flatMap(recordFieldNames));
  const availableLowerCase = new Set([...available].map((field) => field.toLowerCase()));
  const missing = REQUIRED_PLAYER_FIELDS.filter(
    (field) =>
      !available.has(field) &&
      !(field === "IsCreated" && availableLowerCase.has("iscreated")),
  );
  if (missing.length) {
    throw new Error(`Player table is missing required fields: ${missing.join(", ")}`);
  }
}

export function validPlayerRecords(table) {
  return table.records.filter((record) => !record.isEmpty);
}
