export const POSITION_FAMILIES = Object.freeze({
  Quarterbacks: Object.freeze(["QB"]),
  Backfield: Object.freeze(["HB", "FB"]),
  Receivers: Object.freeze(["WR", "TE"]),
  OffensiveLine: Object.freeze(["LT", "LG", "C", "RG", "RT"]),
  DefensiveLine: Object.freeze(["LE", "RE", "DT"]),
  Linebackers: Object.freeze(["LOLB", "MLB", "ROLB"]),
  DefensiveBacks: Object.freeze(["CB", "FS", "SS"]),
  Specialists: Object.freeze(["K", "P"]),
});

// Ordered nearest-position preferences within each family. Editing this object is
// enough to tune family matching without touching the matching implementation.
export const POSITION_PREFERENCES = Object.freeze({
  QB: Object.freeze(["QB"]),
  HB: Object.freeze(["HB", "FB"]),
  FB: Object.freeze(["FB", "HB"]),
  WR: Object.freeze(["WR", "TE"]),
  TE: Object.freeze(["TE", "WR"]),
  LT: Object.freeze(["LT", "RT", "LG", "RG", "C"]),
  RT: Object.freeze(["RT", "LT", "RG", "LG", "C"]),
  LG: Object.freeze(["LG", "RG", "C", "LT", "RT"]),
  RG: Object.freeze(["RG", "LG", "C", "RT", "LT"]),
  C: Object.freeze(["C", "LG", "RG", "LT", "RT"]),
  LE: Object.freeze(["LE", "RE", "DT"]),
  RE: Object.freeze(["RE", "LE", "DT"]),
  DT: Object.freeze(["DT", "LE", "RE"]),
  LOLB: Object.freeze(["LOLB", "ROLB", "MLB"]),
  ROLB: Object.freeze(["ROLB", "LOLB", "MLB"]),
  MLB: Object.freeze(["MLB", "LOLB", "ROLB"]),
  CB: Object.freeze(["CB", "FS", "SS"]),
  FS: Object.freeze(["FS", "SS", "CB"]),
  SS: Object.freeze(["SS", "FS", "CB"]),
  K: Object.freeze(["K", "P"]),
  P: Object.freeze(["P", "K"]),
});

export const POSITION_TO_FAMILY = Object.freeze(
  Object.fromEntries(
    Object.entries(POSITION_FAMILIES).flatMap(([family, positions]) =>
      positions.map((position) => [position, family]),
    ),
  ),
);

// Cross-family base costs. Lower is preferred. Physical differences are added
// separately, so these values encode football function rather than player size.
export const CROSS_FAMILY_COSTS = Object.freeze({
  "OffensiveLine>Receivers": 12,
  "Receivers>OffensiveLine": 15,
  "DefensiveLine>Linebackers": 12,
  "Linebackers>DefensiveLine": 12,
  "DefensiveBacks>Backfield": 16,
  "Backfield>DefensiveBacks": 16,
  "Linebackers>Backfield": 20,
  "Backfield>Linebackers": 20,
  "DefensiveBacks>Receivers": 22,
  "Receivers>DefensiveBacks": 22,
  "DefensiveLine>OffensiveLine": 24,
  "OffensiveLine>DefensiveLine": 24,
  "DefensiveBacks>Specialists": 34,
  "Specialists>DefensiveBacks": 34,
});

export function familyFor(position) {
  return POSITION_TO_FAMILY[position] ?? null;
}
