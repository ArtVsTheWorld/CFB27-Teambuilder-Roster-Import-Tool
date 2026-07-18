import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { TRANSFER_FIELDS, PRESERVED_FIELDS } from "../src/config/transferFields.js";
import { normalizePosition, isTrueValue, selectOmarPlaceholders } from "../src/players/filterPlayers.js";
import { matchPlayers, minimumCostPairs } from "../src/players/matchPlayers.js";
import {
  applyTransferPlan,
  captureValidationBaseline,
  createTransferPlan,
  fingerprintRecord,
} from "../src/players/transferFields.js";
import { validateTransfer } from "../src/players/validateTransfer.js";
import { writeTransferReports } from "../src/reports/writeTransferReport.js";
import { backupFilename, createBackup } from "../src/save/backupSave.js";
import { formatTeamName, teamNameFor } from "../src/save/findTeamTable.js";
import { normalizeDroppedPath } from "../src/utils/paths.js";

function record(index, values = {}) {
  const result = {
    index,
    isEmpty: false,
    FirstName: "Test",
    LastName: `Player${index}`,
    Position: "QB",
    TeamIndex: 1,
    CharacterVisuals: `visual-${index}`,
    CharacterGameplay: `gameplay-${index}`,
    IsCreated: false,
    Height: 72,
    Weight: 200,
    SpeedRating: 80,
    StrengthRating: 70,
    PlayerType: "Default",
    ...values,
  };
  result.fields = Object.fromEntries(
    Object.keys(result)
      .filter((key) => !["index", "isEmpty", "fields"].includes(key))
      .map((key) => [key, {}]),
  );
  return result;
}

function player(rec, options = {}) {
  return {
    record: rec,
    recordIndex: rec.index,
    name: `${rec.FirstName} ${rec.LastName}`,
    position: rec.Position,
    teamIndex: rec.TeamIndex,
    isCreated: Boolean(rec.IsCreated),
    isPlaceholder: options.isPlaceholder === true,
  };
}

test("approved field classification is disjoint and protects visuals", () => {
  assert.equal(TRANSFER_FIELDS.length, 218);
  assert.equal(PRESERVED_FIELDS.length, 64);
  assert.equal(new Set(TRANSFER_FIELDS).size, TRANSFER_FIELDS.length);
  assert.equal(new Set(PRESERVED_FIELDS).size, PRESERVED_FIELDS.length);
  assert.ok(PRESERVED_FIELDS.includes("CharacterVisuals"));
  assert.ok(PRESERVED_FIELDS.includes("CharacterGameplay"));
  assert.ok(!TRANSFER_FIELDS.includes("CharacterVisuals"));
  assert.ok(TRANSFER_FIELDS.includes("Position"));
  assert.ok(TRANSFER_FIELDS.includes("BaseNILValue"));
  assert.ok(TRANSFER_FIELDS.includes("CurrentNILCompensation"));
});

test("bundled schema is CFB 27 version 472.0", () => {
  const schema = JSON.parse(gunzipSync(fs.readFileSync("engine-data/C27_472_0.gz")));
  assert.deepEqual(schema.meta, { major: 472, minor: 0, gameYear: 27 });
});

test("team names use school and nickname with a TeamIndex fallback", () => {
  assert.equal(
    formatTeamName({ DisplayName: "East Point", NickName: "Green Storm" }, 39),
    "East Point (Green Storm)",
  );
  assert.equal(teamNameFor(new Map(), 99), "TeamIndex 99");
});

test("backup filenames keep the DYNASTY prefix and are never overwritten", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cfb27-backup-"));
  try {
    const original = path.join(directory, "DYNASTY-Test.Save");
    fs.writeFileSync(original, "save-data");
    const date = new Date(2026, 6, 18, 18, 30, 45);
    assert.equal(backupFilename(original, date), "DYNASTY-TestB07181830");
    const first = createBackup(original, date);
    const second = createBackup(original, date);
    assert.match(path.basename(first), /^DYNASTY-[A-Za-z0-9]+$/);
    assert.match(path.basename(second), /^DYNASTY-[A-Za-z0-9]+$/);
    assert.notEqual(first, second);
    assert.equal(fs.readFileSync(first, "utf8"), "save-data");
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("drag-and-drop paths and truthy created-player values normalize", () => {
  const expected = normalizeDroppedPath("C:/tmp/example");
  assert.equal(normalizeDroppedPath('  "C:/tmp/example"  '), expected);
  assert.equal(normalizeDroppedPath("'C:/tmp/example'"), expected);
  for (const value of [true, 1, "1", "TRUE", "yes", "Y"]) assert.equal(isTrueValue(value), true);
  for (const value of [false, 0, "0", "false", ""]) assert.equal(isTrueValue(value), false);
});

test("binary and named positions normalize", () => {
  assert.equal(normalizePosition("QB"), "QB");
  assert.equal(normalizePosition("11"), "WR");
  assert.equal(normalizePosition(18), "CB");
});

test("matching prioritizes exact, then configured family, then cross-family", () => {
  const sources = [
    player(record(1, { Position: "QB" })),
    player(record(2, { Position: "FS" })),
    player(record(3, { Position: "LT", Weight: 310 })),
  ];
  const targets = [
    player(record(101, { Position: "QB" })),
    player(record(102, { Position: "SS" })),
    player(record(103, { Position: "TE", Weight: 255 })),
  ];
  const result = matchPlayers(sources, targets);
  assert.deepEqual(result.matches.map((match) => match.matchType), ["EXACT", "FAMILY", "CROSS-FAMILY"]);
  assert.equal(new Set(result.matches.map((match) => match.sourceRecordIndex)).size, 3);
  assert.equal(new Set(result.matches.map((match) => match.targetRecordIndex)).size, 3);
});

test("minimum-cost matching is deterministic for rectangular inputs", () => {
  const sources = [player(record(1)), player(record(2)), player(record(3))];
  const targets = [player(record(10)), player(record(11))];
  const cost = (source, target) => Math.abs(source.recordIndex - (target.recordIndex - 9));
  const first = minimumCostPairs(sources, targets, cost).map(([s, t]) => [s.recordIndex, t.recordIndex]);
  const second = minimumCostPairs(sources, targets, cost).map(([s, t]) => [s.recordIndex, t.recordIndex]);
  assert.deepEqual(first, second);
  assert.equal(first.length, 2);
});

test("Omar Omar placeholders are deterministic and exclude the target team", () => {
  const records = [
    record(5, { FirstName: "Omar", LastName: "Omar", TeamIndex: 0 }),
    record(3, { FirstName: "Omar", LastName: "Omar", TeamIndex: 0 }),
    record(2, { FirstName: "Omar", LastName: "Omar", TeamIndex: 39 }),
    record(1, { FirstName: "Other", LastName: "Player", TeamIndex: 0 }),
  ];
  assert.deepEqual(
    selectOmarPlaceholders(records, 39, 2).map((entry) => entry.recordIndex),
    [3, 5],
  );
  assert.deepEqual(
    selectOmarPlaceholders(records, 39, 2, new Set([3])).map((entry) => entry.recordIndex),
    [5],
  );
});

test("transfer and validation preserve visuals, unknown fields, and normal TeamIndex", () => {
  const sourceRecord = record(1, { FirstName: "RTG", Position: "QB", SpeedRating: 95, TeamIndex: 7 });
  const targetRecord = record(10, {
    FirstName: "Dynasty",
    Position: "QB",
    SpeedRating: 70,
    TeamIndex: 39,
    CharacterVisuals: "keep-me",
    UnknownInternalId: 12345,
  });
  targetRecord.fields.UnknownInternalId = {};
  const source = player(sourceRecord);
  const target = player(targetRecord);
  const matched = matchPlayers([source], [target]);
  const plan = createTransferPlan(matched.matches, 39, ["FirstName", "Position", "SpeedRating"]);
  const table = { records: [targetRecord] };
  const baseline = captureValidationBaseline(table, plan);
  applyTransferPlan(plan);
  const validation = validateTransfer({
    table,
    baseline,
    plan,
    transferFields: ["FirstName", "Position", "SpeedRating"],
    targetTeamIndex: 39,
    includeCreated: false,
    skippedCreated: [],
  });
  assert.equal(validation.passed, true, validation.errors.join("; "));
  assert.equal(targetRecord.CharacterVisuals, "keep-me");
  assert.equal(targetRecord.UnknownInternalId, 12345);
  assert.equal(targetRecord.TeamIndex, 39);
  assert.equal(targetRecord.SpeedRating, 95);
});

test("placeholder transfer changes only its explicit TeamIndex exception and approved fields", () => {
  const source = player(record(1, { FirstName: "RTG", TeamIndex: 7, SpeedRating: 91 }));
  const placeholderRecord = record(10, {
    FirstName: "Omar",
    LastName: "Omar",
    TeamIndex: 0,
    CharacterVisuals: "placeholder-visual",
  });
  const placeholder = player(placeholderRecord, { isPlaceholder: true });
  const result = matchPlayers([source], [placeholder]);
  const plan = createTransferPlan(result.matches, 39, ["FirstName", "LastName", "SpeedRating"]);
  const table = { records: [placeholderRecord] };
  const baseline = captureValidationBaseline(table, plan);
  applyTransferPlan(plan);
  const validation = validateTransfer({
    table,
    baseline,
    plan,
    transferFields: ["FirstName", "LastName", "SpeedRating"],
    targetTeamIndex: 39,
    includeCreated: false,
    skippedCreated: [],
  });
  assert.equal(validation.passed, true, validation.errors.join("; "));
  assert.equal(placeholderRecord.TeamIndex, 39);
  assert.equal(placeholderRecord.CharacterVisuals, "placeholder-visual");
});

test("untouched franchise records fingerprint raw bytes without decoding fields", () => {
  let decodedFields = 0;
  const franchiseRecord = {
    index: 42,
    isEmpty: false,
    data: Buffer.from("raw-franchise-record"),
    fields: {
      ExpensiveField: {},
    },
    get ExpensiveField() {
      decodedFields += 1;
      throw new Error("This lazy field should not be decoded");
    },
  };
  const first = fingerprintRecord(franchiseRecord);
  const second = fingerprintRecord(franchiseRecord);
  assert.equal(first, second);
  assert.equal(decodedFields, 0);
});

test("combined multi-team plans validate distinct placeholder TeamIndex assignments", () => {
  const sourceA = player(record(1, { FirstName: "SourceA", TeamIndex: 7 }));
  const sourceB = player(record(2, { FirstName: "SourceB", TeamIndex: 8 }));
  const targetRecordA = record(10, { FirstName: "Omar", LastName: "Omar", TeamIndex: 0 });
  const targetRecordB = record(11, { FirstName: "Omar", LastName: "Omar", TeamIndex: 0 });
  const targetA = player(targetRecordA, { isPlaceholder: true });
  const targetB = player(targetRecordB, { isPlaceholder: true });
  const plan = [
    ...createTransferPlan(matchPlayers([sourceA], [targetA]).matches, 39, ["FirstName"]),
    ...createTransferPlan(matchPlayers([sourceB], [targetB]).matches, 40, ["FirstName"]),
  ];
  const table = { records: [targetRecordA, targetRecordB] };
  const baseline = captureValidationBaseline(table, plan);
  applyTransferPlan(plan);
  const validation = validateTransfer({
    table,
    baseline,
    plan,
    transferFields: ["FirstName"],
    includeCreated: false,
    skippedCreated: [],
  });
  assert.equal(validation.passed, true, validation.errors.join("; "));
  assert.equal(targetRecordA.TeamIndex, 39);
  assert.equal(targetRecordB.TeamIndex, 40);
});

test("multi-team reports include team indices and aggregate replacements", () => {
  const source = player(record(1, { FirstName: "Source", TeamIndex: 7 }));
  const target = player(record(10, { FirstName: "Target", TeamIndex: 39 }));
  const matchResult = matchPlayers([source], [target]);
  const plan = createTransferPlan(matchResult.matches, 39, ["FirstName"]);
  plan.forEach((replacement) => {
    replacement.sourceTeamName = "Source School";
    replacement.targetTeamName = "Target School";
  });
  const team = {
    sequence: 1,
    sourceTeamIndex: 7,
    targetTeamIndex: 39,
    sourceTeamName: "Source School",
    targetTeamName: "Target School",
    totalSourcePlayers: 1,
    createdPlayers: [],
    eligibleSourcePlayers: [source],
    skippedCreated: [],
    originalTargetPlayers: [target],
    placeholders: [],
    matchResult,
    plan,
  };
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cfb27-report-"));
  try {
    const reports = writeTransferReports({
      toolVersion: "test",
      mode: "dry-run",
      rtgSavePath: "RTG-test",
      dynastySavePath: "DYNASTY-test",
      teamTransfers: [team],
      includeCreated: false,
      totalRtgTableRecords: 1,
      totalSourcePlayers: 1,
      eligibleSourcePlayers: [source],
      originalTargetPlayers: [target],
      placeholders: [],
      skippedCreated: [],
      matchResult,
      plan,
      missingApprovedFields: [],
      transferFields: ["FirstName"],
      preservedFields: ["CharacterVisuals"],
      backupPath: null,
      saveResult: "PREVIEW",
      validation: { passed: null },
    }, directory);
    const json = JSON.parse(fs.readFileSync(reports.jsonPath, "utf8"));
    const csv = fs.readFileSync(reports.csvPath, "utf8");
    assert.deepEqual(json.sourceTeamIndices, [7]);
    assert.deepEqual(json.targetTeamIndices, [39]);
    assert.equal(json.totals.replacements, 1);
    assert.equal(json.teamTransfers[0].sourceTeamName, "Source School");
    assert.equal(json.teamTransfers[0].targetTeamName, "Target School");
    assert.match(csv, /SourceTeamIndex,TargetTeamIndex/);
    assert.match(csv, /SourceTeamName,TargetTeamName/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
