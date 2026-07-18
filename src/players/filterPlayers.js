const POSITION_BY_ID = Object.freeze([
  "QB", "HB", "FB", "WR", "TE", "LT", "LG", "C", "RG", "RT", "K",
  "P", "LE", "RE", "DT", "LOLB", "MLB", "ROLB", "CB", "FS", "SS",
]);

export function normalizePosition(value) {
  if (POSITION_BY_ID.includes(value)) return value;
  if (typeof value === "number" && Number.isInteger(value)) return POSITION_BY_ID[value];
  if (typeof value === "string" && /^[01]+$/.test(value)) {
    return POSITION_BY_ID[Number.parseInt(value, 2)];
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    return POSITION_BY_ID[Number.parseInt(value, 10)];
  }
  return undefined;
}

export function integerValue(value) {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isInteger(parsed) ? parsed : null;
}

export function isTrueValue(value) {
  if (value === true || value === 1) return true;
  return ["true", "1", "yes", "y"].includes(String(value ?? "").trim().toLowerCase());
}

export function playerName(record) {
  const first = String(record.FirstName ?? "Unknown").trim();
  const last = String(record.LastName ?? "Player").trim();
  return `${first} ${last}`.trim();
}

export function describePlayer(record, fallbackIndex = 0, options = {}) {
  const recordIndex = Number.isInteger(record.index) ? record.index : fallbackIndex;
  const position = normalizePosition(record.Position);
  if (!position) {
    throw new Error(
      `Unsupported Position value ${String(record.Position)} on player-table record ${recordIndex}.`,
    );
  }
  return {
    record,
    recordIndex,
    name: playerName(record),
    position,
    teamIndex: integerValue(record.TeamIndex),
    isCreated: isTrueValue(record.IsCreated ?? record.isCreated),
    isPlaceholder: options.isPlaceholder === true,
  };
}

export function playersForTeam(records, teamIndex) {
  const players = [];
  records.forEach((record, index) => {
    if (integerValue(record.TeamIndex) !== teamIndex) return;
    try {
      players.push(describePlayer(record, index));
    } catch {
      // A nonempty table row with an invalid position is not transferable.
    }
  });
  return players;
}

export function splitCreatedPlayers(players, includeCreated) {
  const created = players.filter((player) => player.isCreated);
  return {
    eligible: includeCreated ? [...players] : players.filter((player) => !player.isCreated),
    skipped: includeCreated ? [] : created,
    created,
  };
}

export function isOmarPlaceholder(record) {
  return (
    String(record.FirstName ?? "").trim().toLowerCase() === "omar" &&
    String(record.LastName ?? "").trim().toLowerCase() === "omar"
  );
}

export function selectOmarPlaceholders(
  records,
  targetTeamIndex,
  needed,
  excludedRecordIndices = new Set(),
) {
  if (needed <= 0) return [];
  return records
    .map((record, index) => ({ record, index }))
    .filter(
      ({ record }) =>
        integerValue(record.TeamIndex) !== targetTeamIndex &&
        isOmarPlaceholder(record) &&
        !excludedRecordIndices.has(record.index),
    )
    .map(({ record, index }) => describePlayer(record, index, { isPlaceholder: true }))
    .sort((left, right) => left.recordIndex - right.recordIndex)
    .slice(0, needed);
}
