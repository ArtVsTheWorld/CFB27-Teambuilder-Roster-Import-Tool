# Teambuilder Roster Import Tool by Ace

Transfers one or more selected College Football 27 Road to Glory rosters into
selected Dynasty teams using position-aware matching. The RTG file is read-only. The Dynasty
file is changed only after a preview, explicit confirmation, backup, validation,
temporary serialization, and successful reopen.

## What the tool does

- Opens CFB 27 saves with `madden-franchise` and schema `C27_472_0.gz`.
- Finds the player table by stable Unique ID `1612938518`.
- Finds the main team table by stable Unique ID `3359508968` and shows school names
  in selection summaries, replacement logs, reports, and the completion message.
- Exports all valid RTG player records to `exports/rtg-player-table.csv`.
- Detects created players through `IsCreated` boolean/numeric/string values.
- Matches players once each: `EXACT`, then `FAMILY`, then deterministic
  `CROSS-FAMILY` physical/functional scoring.
- Preserves `CharacterVisuals`, `CharacterGameplay`, record indices, unknown fields,
  references, statistics, injury/wear state, XP, and target TeamIndex.
- Prompts for a team count, then collects a unique RTG and Dynasty TeamIndex pair
  for every requested replacement. All teams share one preview, backup, save, and
  validation transaction.
- Copies only the 218 approved fields in `src/config/transferFields.js`, including
  `BaseNILValue` and `CurrentNILCompensation`.
- When source exceeds target, uses the required number of nonempty placeholder
  placeholders up to the 85-player cap. Only those placeholders receive the target
  TeamIndex; their existing `CharacterVisuals` remains unchanged.
- Writes timestamped multi-team JSON and CSV reports under `reports/`.
- Prints a paced, color-coded replacement table: exact matches are green, family
  matches yellow, and cross-family matches red.
