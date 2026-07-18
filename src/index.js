#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { confirm, input, select } from "@inquirer/prompts";
import { DISPLAY_VERSION, ROSTER_CAP, TOOL_NAME, TOOL_VERSION } from "./config/constants.js";
import { PRESERVED_FIELDS } from "./config/transferFields.js";
import { createBackup } from "./save/backupSave.js";
import { readPlayerTable, validPlayerRecords } from "./save/findPlayerTable.js";
import { readTeamNameMap, teamNameFor } from "./save/findTeamTable.js";
import { openSave } from "./save/openSave.js";
import { replaceOriginalWithVerifiedTemp, serializeAndVerify } from "./save/saveChanges.js";
import { playersForTeam, selectOmarPlaceholders, splitCreatedPlayers } from "./players/filterPlayers.js";
import { matchPlayers } from "./players/matchPlayers.js";
import {
  applyTransferPlan,
  captureValidationBaseline,
  createTransferPlan,
  resolveTransferFields,
  rollbackTransferPlan,
} from "./players/transferFields.js";
import { validateTransfer } from "./players/validateTransfer.js";
import { exportPlayerTable } from "./reports/exportCsv.js";
import { writeTransferReports } from "./reports/writeTransferReport.js";
import { log } from "./utils/logging.js";
import { filenameHasPrefix, isExistingFile, normalizeDroppedPath, sleep } from "./utils/paths.js";

function printOpeningBanner() {
  const width = 48;
  console.log("\n" + "=".repeat(width));
  console.log(TOOL_NAME.padStart((width + TOOL_NAME.length) / 2));
  console.log("by Ace".padStart((width + 6) / 2));
  console.log(`Version ${DISPLAY_VERSION}`.padStart((width + `Version ${DISPLAY_VERSION}`.length) / 2));
  console.log("=".repeat(width));
  console.log("Copy TeamBuilder/RTG rosters into a Dynasty save safely.\n");
}

async function waitForAnyKey() {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== "function") return;
  process.stdout.write("\nPress any key to exit the tool...");
  await new Promise((resolve) => {
    const wasRaw = process.stdin.isRaw;
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.once("data", () => {
      if (!wasRaw) process.stdin.setRawMode(false);
      process.stdin.pause();
      console.log("");
      resolve();
    });
  });
}

async function printCompletion(teamTransfers, saved) {
  console.log("\n" + "=".repeat(58));
  if (saved) {
    console.log("TOOL COMPLETE - ROSTERS IMPORTED SUCCESSFULLY");
    console.log("\nImported teams:");
    for (const team of teamTransfers) {
      console.log(`  ${team.sourceTeamName} -> ${team.targetTeamName}`);
      await sleep(20);
    }
  } else {
    console.log("PREVIEW COMPLETE - NO SAVE FILES WERE CHANGED");
    console.log("\nPreviewed teams:");
    for (const team of teamTransfers) {
      console.log(`  ${team.sourceTeamName} -> ${team.targetTeamName}`);
      await sleep(20);
    }
  }
  console.log("\nThanks for using the Teambuilder Roster Import Tool by Ace!");
  console.log("=".repeat(58));
  await waitForAnyKey();
}

async function chooseSavePath(label, prefix) {
  while (true) {
    const raw = await input({
      message: `Enter or drag-and-drop the ${label} save path:`,
      validate(value) {
        return isExistingFile(normalizeDroppedPath(value)) || "Choose an existing save file.";
      },
    });
    const savePath = normalizeDroppedPath(raw);
    if (filenameHasPrefix(savePath, prefix)) return savePath;
    log.warn(`Warning: ${path.basename(savePath)} does not begin with ${prefix}.`);
    if (await confirm({ message: "Use this file anyway? Choose No to enter a different path.", default: false })) {
      return savePath;
    }
  }
}

async function chooseAndOpenSave(label, prefix) {
  while (true) {
    const savePath = await chooseSavePath(label, prefix);
    try {
      log.info(`Opening ${label} save...`);
      const franchise = await openSave(savePath);
      const table = await readPlayerTable(franchise);
      const teamNames = await readTeamNameMap(franchise);
      return { savePath, franchise, table, records: validPlayerRecords(table), teamNames: teamNames.names };
    } catch (error) {
      log.error(`Could not open this ${label} save: ${error.message}`);
      if (!(await confirm({ message: `Choose a different ${label} save path?`, default: true }))) throw error;
    }
  }
}

async function chooseInteger(message, { minimum = 0, maximum = Number.MAX_SAFE_INTEGER } = {}) {
  while (true) {
    const raw = await input({ message });
    if (!/^-?\d+$/.test(raw.trim())) {
      log.error("Enter a valid integer.");
      continue;
    }
    const value = Number.parseInt(raw.trim(), 10);
    if (value < minimum || value > maximum) {
      log.error(`Enter a value from ${minimum} through ${maximum}.`);
      continue;
    }
    return value;
  }
}

async function chooseTeamIndex(records, label, usedTeamIndices, excludedRecordIndices = new Set()) {
  while (true) {
    const teamIndex = await chooseInteger(`Enter the ${label} TeamIndex:`);
    if (usedTeamIndices.has(teamIndex)) {
      log.error(`TeamIndex ${teamIndex} has already been selected for this save.`);
      continue;
    }
    const players = playersForTeam(records, teamIndex).filter(
      (player) => !excludedRecordIndices.has(player.recordIndex),
    );
    if (!players.length) {
      log.error(`No available transferable player records were found for TeamIndex ${teamIndex}.`);
      continue;
    }
    return { teamIndex, players };
  }
}

async function printPlayerList(title, players) {
  if (!players.length) return;
  log.warn(`${title} (${players.length}):`);
  for (const player of players) {
    log.warn(`  ${player.name} (${player.position}) - record ${player.recordIndex}`);
    await sleep();
  }
}

const TABLE_WIDTHS = Object.freeze({ source: 24, sourcePosition: 8, target: 24, targetPosition: 8, type: 12 });

function fit(value, width) {
  const text = String(value ?? "");
  if (text.length <= width) return text.padEnd(width, " ");
  return `${text.slice(0, Math.max(0, width - 3))}...`;
}

function replacementTableLine(values) {
  return `| ${fit(values.source, TABLE_WIDTHS.source)} | ${fit(values.sourcePosition, TABLE_WIDTHS.sourcePosition)} | ` +
    `${fit(values.target, TABLE_WIDTHS.target)} | ${fit(values.targetPosition, TABLE_WIDTHS.targetPosition)} | ` +
    `${fit(values.type, TABLE_WIDTHS.type)} |`;
}

async function printPreview(teamTransfers) {
  console.log("\nMatching preview / replacement log\n==================================");
  const header = replacementTableLine({
    source: "RTG source player",
    sourcePosition: "Src Pos",
    target: "Dynasty player replaced",
    targetPosition: "Tgt Pos",
    type: "Match type",
  });
  const separator = "-".repeat(header.length);
  for (const team of teamTransfers) {
    console.log(
      `\nTeam ${team.sequence}: ${team.sourceTeamName} (RTG ${team.sourceTeamIndex}) ` +
        `-> ${team.targetTeamName} (Dynasty ${team.targetTeamIndex})`,
    );
    console.log(separator);
    console.log(header);
    console.log(separator);
    for (const match of team.matchResult.matches) {
      const line = replacementTableLine({
        source: match.sourceName,
        sourcePosition: match.sourcePosition,
        target: match.targetName,
        targetPosition: match.targetPosition,
        type: match.matchType,
      });
      log.replacementTableRow(line, match.matchType);
      await sleep();
    }
    console.log(separator);
    log.info(
      `EXACT ${team.matchResult.counts.exact} | FAMILY ${team.matchResult.counts.family} | ` +
        `CROSS-FAMILY ${team.matchResult.counts.crossFamily}`,
    );
    const positionChanges = team.matchResult.matches.filter(
      (match) => match.sourcePosition !== match.targetPosition,
    ).length;
    if (positionChanges) log.warn(`${positionChanges} match(es) change the target slot's original position.`);
    await sleep(25);
  }
}

function combineMatchResults(teamTransfers) {
  return {
    matches: teamTransfers.flatMap((team) => team.matchResult.matches),
    unmatchedSources: teamTransfers.flatMap((team) => team.matchResult.unmatchedSources),
    unmatchedTargets: teamTransfers.flatMap((team) => team.matchResult.unmatchedTargets),
    counts: {
      exact: teamTransfers.reduce((sum, team) => sum + team.matchResult.counts.exact, 0),
      family: teamTransfers.reduce((sum, team) => sum + team.matchResult.counts.family, 0),
      crossFamily: teamTransfers.reduce((sum, team) => sum + team.matchResult.counts.crossFamily, 0),
    },
  };
}

async function chooseMode(forceDryRun) {
  if (forceDryRun) return "dry-run";
  return select({
    message: "Choose what you want the tool to do today:",
    choices: [
      { name: "Preview only / dry run", value: "dry-run" },
      { name: "Apply transfer and save (creates backup)", value: "save" },
    ],
  });
}

function makeReportData(context, overrides = {}) {
  return {
    toolVersion: TOOL_VERSION,
    mode: context.mode,
    rtgSavePath: context.rtgSavePath,
    dynastySavePath: context.dynastySavePath,
    teamTransfers: context.teamTransfers,
    includeCreated: context.includeCreated,
    totalSourcePlayers: context.totalSourcePlayers,
    totalRtgTableRecords: context.totalRtgTableRecords,
    eligibleSourcePlayers: context.eligibleSourcePlayers,
    originalTargetPlayers: context.originalTargetPlayers,
    placeholders: context.placeholders,
    skippedCreated: context.skippedCreated,
    matchResult: context.matchResult,
    plan: context.plan,
    missingApprovedFields: context.missingApprovedFields,
    transferFields: context.transferFields,
    preservedFields: PRESERVED_FIELDS,
    backupPath: context.backupPath,
    saveResult: context.saveResult,
    validation: context.validation,
    ...overrides,
  };
}

export async function runTool({ forceDryRun = process.argv.includes("--dry-run") } = {}) {
  printOpeningBanner();
  const mode = await chooseMode(forceDryRun);

  console.log("\nSTEP 1 - CHOOSE THE SOURCE SAVE");
  console.log("Select the Road to Glory save that contains the TeamBuilder rosters you want to copy.");
  const rtgOpened = await chooseAndOpenSave("Road to Glory", "RTG-");
  const rtgSavePath = rtgOpened.savePath;
  const rtgRecords = rtgOpened.records;
  const rtgTeamNames = rtgOpened.teamNames;
  const exportPath = exportPlayerTable(rtgRecords, path.resolve("exports", "rtg-player-table.csv"));
  log.success(`Exported ${rtgRecords.length} valid RTG records to ${exportPath}`);

  console.log("\nSTEP 2 - CHOOSE THE DESTINATION SAVE");
  console.log("Select the Dynasty save that will receive the imported rosters.");
  let dynastyOpened;
  do {
    dynastyOpened = await chooseAndOpenSave("Dynasty", "DYNASTY-");
    if (path.resolve(dynastyOpened.savePath) === path.resolve(rtgSavePath)) {
      log.error("RTG and Dynasty paths must refer to different files.");
      dynastyOpened = null;
    }
  } while (!dynastyOpened);
  const {
    savePath: dynastySavePath,
    franchise: dynastySave,
    table: dynastyTable,
    records: dynastyRecords,
  } = dynastyOpened;
  const dynastyTeamNames = dynastyOpened.teamNames;

  console.log("\nSTEP 3 - CHOOSE HOW MANY ROSTERS TO IMPORT");
  console.log("You will enter one RTG source TeamIndex and one Dynasty destination TeamIndex for each roster.");
  const teamCount = await chooseInteger("How many Dynasty team rosters would you like to replace?", {
    minimum: 1,
    maximum: 32,
  });
  console.log("\nSTEP 4 - CREATED PLAYER OPTION");
  console.log("WARNING: Transferring Road to Glory created players is currently buggy.");
  console.log("Choose No unless you understand the risk and specifically want to try importing them.");
  const includeCreated = await confirm({
    message: "Would you like the tool to transfer in Road to Glory created players as well?",
    default: false,
  });

  const usedSourceTeamIndices = new Set();
  const usedTargetTeamIndices = new Set();
  const reservedTargetRecordIndices = new Set();
  const teamTransfers = [];

  for (let sequence = 1; sequence <= teamCount; sequence += 1) {
    console.log(`\nSTEP 5 - CONFIGURE ROSTER ${sequence} OF ${teamCount}\n${"-".repeat(42)}`);
    console.log("First choose the RTG team to copy FROM, then the Dynasty team to replace.");
    let sourceSelection;
    let sourceSplit;
    while (true) {
      sourceSelection = await chooseTeamIndex(
        rtgRecords,
        `RTG source team ${sequence} (copy roster FROM this team)`,
        usedSourceTeamIndices,
      );
      sourceSplit = splitCreatedPlayers(sourceSelection.players, includeCreated);
      if (sourceSplit.eligible.length) break;
      log.error("That source team has no eligible players with the current created-player setting.");
    }
    const targetSelection = await chooseTeamIndex(
      dynastyRecords,
      `Dynasty destination team ${sequence} (replace this team's roster)`,
      usedTargetTeamIndices,
      reservedTargetRecordIndices,
    );

    const sourceCount = sourceSplit.eligible.length;
    const targetCount = targetSelection.players.length;
    const expansionNeeded = Math.max(0, Math.min(sourceCount, ROSTER_CAP) - targetCount);
    const placeholders = selectOmarPlaceholders(
      dynastyRecords,
      targetSelection.teamIndex,
      expansionNeeded,
      reservedTargetRecordIndices,
    );
    const effectiveTargets = [...targetSelection.players, ...placeholders];
    const matchResult = matchPlayers(sourceSplit.eligible, effectiveTargets);
    const sourceTeamName = teamNameFor(rtgTeamNames, sourceSelection.teamIndex);
    const targetTeamName = teamNameFor(dynastyTeamNames, targetSelection.teamIndex);

    for (const player of sourceSplit.skipped) {
      log.skipped(`${player.name} (${player.position}) - IsCreated=true`);
      await sleep();
    }
    console.log(`Source RTG team: ${sourceTeamName} (TeamIndex ${sourceSelection.teamIndex})`);
    console.log(`Destination Dynasty team: ${targetTeamName} (TeamIndex ${targetSelection.teamIndex})`);
    console.log(`Source players found: ${sourceSelection.players.length}`);
    console.log(`Created players found: ${sourceSplit.created.length}`);
    console.log(`Eligible source players: ${sourceCount}`);
    console.log(`Original target players: ${targetCount}`);
    console.log(`Placeholder expansion slots selected: ${placeholders.length}`);

    if (sourceCount !== targetCount) {
      const difference = sourceCount - targetCount;
      log.warn(
        `Roster counts differ by ${Math.abs(difference)} ` +
          `(${difference > 0 ? "more source players" : "more target players"}).`,
      );
      if (sourceCount > ROSTER_CAP) log.warn(`The source roster exceeds the ${ROSTER_CAP}-player cap.`);
      if (expansionNeeded > placeholders.length) {
        log.warn(`${expansionNeeded - placeholders.length} expansion slot(s) lack an available placeholder.`);
      }
      await printPlayerList("Source players that would remain unmatched", matchResult.unmatchedSources);
      await printPlayerList("Dynasty players that would remain unchanged", matchResult.unmatchedTargets);
      if (!matchResult.unmatchedSources.length && !matchResult.unmatchedTargets.length) {
        log.info("No players will remain unmatched after placeholder expansion.");
      }
      if (placeholders.length) {
        log.info(
          `${placeholders.length} placeholder(s) will be assigned to TeamIndex ${targetSelection.teamIndex}.`,
        );
      }
      if (!(await confirm({ message: "Continue with this roster-count difference?", default: false }))) {
        log.warn("Transfer cancelled. No save files were changed.");
        return { cancelled: true };
      }
    }

    usedSourceTeamIndices.add(sourceSelection.teamIndex);
    usedTargetTeamIndices.add(targetSelection.teamIndex);
    effectiveTargets.forEach((player) => reservedTargetRecordIndices.add(player.recordIndex));
    teamTransfers.push({
      sequence,
      sourceTeamIndex: sourceSelection.teamIndex,
      targetTeamIndex: targetSelection.teamIndex,
      sourceTeamName,
      targetTeamName,
      totalSourcePlayers: sourceSelection.players.length,
      createdPlayers: sourceSplit.created,
      eligibleSourcePlayers: sourceSplit.eligible,
      skippedCreated: sourceSplit.skipped,
      originalTargetPlayers: targetSelection.players,
      placeholders,
      effectiveTargets,
      matchResult,
      plan: [],
    });
  }

  const allEligibleSources = teamTransfers.flatMap((team) => team.eligibleSourcePlayers);
  const allEffectiveTargets = teamTransfers.flatMap((team) => team.effectiveTargets);
  const fieldResolution = resolveTransferFields(
    allEligibleSources.map((player) => player.record),
    allEffectiveTargets.map((player) => player.record),
  );
  if (fieldResolution.missing.length) {
    log.warn(`${fieldResolution.missing.length} approved field(s) are absent; see the report.`);
    for (const missing of fieldResolution.missing) {
      log.warn(
        `  ${missing.field}: source=${missing.missingFromSource ? "missing" : "present"}, ` +
          `target=${missing.missingFromTarget ? "missing" : "present"}`,
      );
      await sleep();
    }
    if (!(await confirm({ message: "Continue without these approved fields?", default: false }))) {
      log.warn("Transfer cancelled. No save files were changed.");
      return { cancelled: true };
    }
  }

  for (const team of teamTransfers) {
    team.plan = createTransferPlan(
      team.matchResult.matches,
      team.targetTeamIndex,
      fieldResolution.available,
    );
    team.plan.forEach((replacement) => {
      replacement.sourceTeamName = team.sourceTeamName;
      replacement.targetTeamName = team.targetTeamName;
    });
  }
  const plan = teamTransfers.flatMap((team) => team.plan);
  const matchResult = combineMatchResults(teamTransfers);
  console.log("\nSTEP 6 - REVIEW THE IMPORT PLAN");
  console.log("Review every player replacement below. Nothing has been changed yet.");
  await printPreview(teamTransfers);

  const context = {
    mode,
    rtgSavePath,
    dynastySavePath,
    teamTransfers,
    includeCreated,
    totalSourcePlayers: teamTransfers.reduce((sum, team) => sum + team.totalSourcePlayers, 0),
    totalRtgTableRecords: rtgRecords.length,
    eligibleSourcePlayers: allEligibleSources,
    originalTargetPlayers: teamTransfers.flatMap((team) => team.originalTargetPlayers),
    placeholders: teamTransfers.flatMap((team) => team.placeholders),
    skippedCreated: teamTransfers.flatMap((team) => team.skippedCreated),
    matchResult,
    plan,
    missingApprovedFields: fieldResolution.missing,
    transferFields: fieldResolution.available,
    backupPath: null,
    saveResult: mode === "dry-run" ? "PREVIEW ONLY - no save modified" : "PENDING",
    validation: { passed: null, checks: [], errors: [], note: "Not applied in preview mode." },
  };

  if (mode === "dry-run") {
    const reports = writeTransferReports(makeReportData(context));
    log.success(`Dry run complete. JSON report: ${reports.jsonPath}`);
    log.success(`Replacement CSV: ${reports.csvPath}`);
    await printCompletion(teamTransfers, false);
    return { ...context, reports };
  }

  const confirmed = await confirm({
    message: `Apply ${plan.length} replacement(s) across ${teamTransfers.length} team(s)?`,
    default: false,
  });
  if (!confirmed) {
    context.saveResult = "CANCELLED AT FINAL CONFIRMATION";
    const reports = writeTransferReports(makeReportData(context));
    log.warn("Transfer cancelled. No save files were changed.");
    return { cancelled: true, reports };
  }

  const baseline = captureValidationBaseline(dynastyTable, plan);
  context.backupPath = createBackup(dynastySavePath);
  log.success(`Backup created: ${context.backupPath}`);
  let tempPath = null;
  try {
    for (const team of teamTransfers) {
      log.info(`Applying RTG ${team.sourceTeamIndex} -> Dynasty ${team.targetTeamIndex}...`);
      await sleep(30);
      applyTransferPlan(team.plan);
    }
    const validationOptions = {
      table: dynastyTable,
      baseline,
      plan,
      transferFields: fieldResolution.available,
      includeCreated,
      skippedCreated: context.skippedCreated,
    };
    const inMemoryValidation = validateTransfer(validationOptions);
    if (!inMemoryValidation.passed) {
      throw new Error(`In-memory validation failed: ${inMemoryValidation.errors.join("; ")}`);
    }

    const serialized = await serializeAndVerify(dynastySave, dynastySavePath, baseline.recordCount);
    tempPath = serialized.tempPath;
    const savedValidation = validateTransfer({ ...validationOptions, table: serialized.verificationTable });
    if (!savedValidation.passed) {
      throw new Error(`Serialized-save validation failed: ${savedValidation.errors.join("; ")}`);
    }
    replaceOriginalWithVerifiedTemp(tempPath, dynastySavePath);
    tempPath = null;
    context.validation = { passed: true, inMemory: inMemoryValidation, serializedSave: savedValidation };
    context.saveResult = "SAVED AND REOPENED SUCCESSFULLY";
    const reports = writeTransferReports(makeReportData(context));
    log.success(`Dynasty save updated successfully: ${dynastySavePath}`);
    log.success(`JSON report: ${reports.jsonPath}`);
    log.success(`Replacement CSV: ${reports.csvPath}`);
    await printCompletion(teamTransfers, true);
    return { ...context, reports };
  } catch (error) {
    if (tempPath && fs.existsSync(tempPath)) fs.rmSync(tempPath, { force: true });
    rollbackTransferPlan(plan);
    context.saveResult = `FAILED - original Dynasty path preserved: ${error.message}`;
    context.validation = { passed: false, checks: [], errors: [error.message] };
    const reports = writeTransferReports(makeReportData(context));
    error.message = `${error.message}\nFailure report: ${reports.jsonPath}\nBackup: ${context.backupPath}`;
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runTool().catch((error) => {
    log.error(`\nERROR: ${error.message}`);
    process.exitCode = 1;
  });
}
