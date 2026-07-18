import {
  CROSS_FAMILY_COSTS,
  POSITION_PREFERENCES,
  familyFor,
} from "../config/positionFamilies.js";

const MATCH = Object.freeze({ exact: "EXACT", family: "FAMILY", cross: "CROSS-FAMILY" });

function numeric(record, field, fallback = 0) {
  const value = Number(record[field]);
  return Number.isFinite(value) ? value : fallback;
}

function physicalDistance(source, target) {
  const height = Math.abs(numeric(source.record, "Height") - numeric(target.record, "Height"));
  const weight = Math.abs(numeric(source.record, "Weight") - numeric(target.record, "Weight"));
  const speed = Math.abs(
    numeric(source.record, "SpeedRating", 50) - numeric(target.record, "SpeedRating", 50),
  );
  const strength = Math.abs(
    numeric(source.record, "StrengthRating", 50) - numeric(target.record, "StrengthRating", 50),
  );
  const playerTypeMismatch =
    String(source.record.PlayerType ?? "") === String(target.record.PlayerType ?? "") ? 0 : 20;
  return height * 10 + Math.round(weight / 2) + speed * 2 + strength * 2 + playerTypeMismatch;
}

function crossBaseCost(source, target) {
  const sourceFamily = familyFor(source.position);
  const targetFamily = familyFor(target.position);
  const key = `${sourceFamily}>${targetFamily}`;
  let base = CROSS_FAMILY_COSTS[key] ?? 80;
  if (["LT", "LG", "C", "RG", "RT"].includes(source.position) && target.position === "TE") base = 8;
  if (["LE", "RE", "DT"].includes(source.position) && ["LOLB", "MLB", "ROLB"].includes(target.position)) base = 9;
  if (["CB", "FS", "SS"].includes(source.position) && ["HB", "FB"].includes(target.position)) base = 12;
  return base;
}

function crossCost(source, target) {
  return crossBaseCost(source, target) * 1_000 + physicalDistance(source, target);
}

function makeMatch(source, target, matchType) {
  return {
    source,
    target,
    matchType,
    sourceName: source.name,
    sourcePosition: source.position,
    sourceRecordIndex: source.recordIndex,
    targetName: target.name,
    targetOriginalFirstName: String(target.record.FirstName ?? ""),
    targetOriginalLastName: String(target.record.LastName ?? ""),
    targetPosition: target.position,
    targetRecordIndex: target.recordIndex,
    targetIsPlaceholder: target.isPlaceholder,
  };
}

function takeBestTarget(source, targets, predicate, ranker) {
  const candidates = targets.filter(predicate);
  if (!candidates.length) return null;
  candidates.sort((left, right) => {
    const rankDifference = ranker(left) - ranker(right);
    if (rankDifference) return rankDifference;
    const physicalDifference = physicalDistance(source, left) - physicalDistance(source, right);
    return physicalDifference || left.recordIndex - right.recordIndex;
  });
  return candidates[0];
}

// Hungarian minimum-cost assignment. It supports rectangular matrices and returns
// one-to-one pairs for the smaller side, leaving deterministic unmatched entries.
export function minimumCostPairs(sources, targets, costFunction = crossCost) {
  if (!sources.length || !targets.length) return [];
  const transposed = sources.length > targets.length;
  const rows = transposed ? targets : sources;
  const columns = transposed ? sources : targets;
  const costs = rows.map((row) =>
    columns.map((column) =>
      transposed ? costFunction(column, row) : costFunction(row, column),
    ),
  );
  const n = rows.length;
  const m = columns.length;
  const u = Array(n + 1).fill(0);
  const v = Array(m + 1).fill(0);
  const p = Array(m + 1).fill(0);
  const way = Array(m + 1).fill(0);

  for (let i = 1; i <= n; i += 1) {
    p[0] = i;
    let column0 = 0;
    const minValues = Array(m + 1).fill(Number.POSITIVE_INFINITY);
    const used = Array(m + 1).fill(false);
    do {
      used[column0] = true;
      const row0 = p[column0];
      let delta = Number.POSITIVE_INFINITY;
      let column1 = 0;
      for (let j = 1; j <= m; j += 1) {
        if (used[j]) continue;
        const current = costs[row0 - 1][j - 1] - u[row0] - v[j];
        if (current < minValues[j]) {
          minValues[j] = current;
          way[j] = column0;
        }
        if (minValues[j] < delta) {
          delta = minValues[j];
          column1 = j;
        }
      }
      for (let j = 0; j <= m; j += 1) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else minValues[j] -= delta;
      }
      column0 = column1;
    } while (p[column0] !== 0);

    do {
      const column1 = way[column0];
      p[column0] = p[column1];
      column0 = column1;
    } while (column0 !== 0);
  }

  const pairs = [];
  for (let column = 1; column <= m; column += 1) {
    if (!p[column]) continue;
    const row = rows[p[column] - 1];
    const columnItem = columns[column - 1];
    pairs.push(transposed ? [columnItem, row] : [row, columnItem]);
  }
  return pairs.sort(
    ([sourceA], [sourceB]) => sourceA.recordIndex - sourceB.recordIndex,
  );
}

export function matchPlayers(sourcePlayers, targetPlayers) {
  const remainingSources = [...sourcePlayers].sort(
    (left, right) => left.recordIndex - right.recordIndex,
  );
  const remainingTargets = [...targetPlayers].sort(
    (left, right) => left.recordIndex - right.recordIndex,
  );
  const matches = [];

  function runPhase(matchType, finder) {
    for (let sourceIndex = 0; sourceIndex < remainingSources.length; ) {
      const source = remainingSources[sourceIndex];
      const target = finder(source, remainingTargets);
      if (!target) {
        sourceIndex += 1;
        continue;
      }
      matches.push(makeMatch(source, target, matchType));
      remainingSources.splice(sourceIndex, 1);
      remainingTargets.splice(remainingTargets.indexOf(target), 1);
    }
  }

  runPhase(MATCH.exact, (source, targets) =>
    takeBestTarget(
      source,
      targets,
      (target) => target.position === source.position,
      () => 0,
    ),
  );

  runPhase(MATCH.family, (source, targets) => {
    const preferences = POSITION_PREFERENCES[source.position];
    if (!preferences) throw new Error(`No position configuration for ${source.position}.`);
    return takeBestTarget(
      source,
      targets,
      (target) =>
        target.position !== source.position &&
        familyFor(target.position) === familyFor(source.position),
      (target) => {
        const rank = preferences.indexOf(target.position);
        return rank === -1 ? Number.MAX_SAFE_INTEGER : rank;
      },
    );
  });

  for (const [source, target] of minimumCostPairs(remainingSources, remainingTargets)) {
    matches.push(makeMatch(source, target, MATCH.cross));
    remainingSources.splice(remainingSources.indexOf(source), 1);
    remainingTargets.splice(remainingTargets.indexOf(target), 1);
  }

  matches.sort((left, right) => left.sourceRecordIndex - right.sourceRecordIndex);
  return {
    matches,
    unmatchedSources: remainingSources,
    unmatchedTargets: remainingTargets,
    counts: {
      exact: matches.filter((match) => match.matchType === MATCH.exact).length,
      family: matches.filter((match) => match.matchType === MATCH.family).length,
      crossFamily: matches.filter((match) => match.matchType === MATCH.cross).length,
    },
  };
}
