import { TEAM_TABLE_UNIQUE_ID } from "../config/constants.js";
import { findTableByUniqueId } from "./findPlayerTable.js";

function clean(value) {
  const text = String(value ?? "").trim();
  return text && text !== "null" ? text : "";
}

export function formatTeamName(record, teamIndex) {
  const school = clean(record?.DisplayName) || clean(record?.LongName) || clean(record?.ShortName);
  const nickname = clean(record?.NickName);
  if (school && nickname && !school.toLowerCase().includes(nickname.toLowerCase())) {
    return `${school} (${nickname})`;
  }
  return school || nickname || `TeamIndex ${teamIndex}`;
}

export async function readTeamNameMap(franchise) {
  const table = findTableByUniqueId(franchise, TEAM_TABLE_UNIQUE_ID);
  await table.readRecords();
  const names = new Map();
  for (const record of table.records.filter((candidate) => !candidate.isEmpty)) {
    const teamIndex = Number(record.TeamIndex);
    if (Number.isInteger(teamIndex)) names.set(teamIndex, formatTeamName(record, teamIndex));
  }
  if (!names.size) throw new Error("The main Team table contains no usable team names.");
  return { table, names };
}

export function teamNameFor(names, teamIndex) {
  return names.get(teamIndex) ?? `TeamIndex ${teamIndex}`;
}
