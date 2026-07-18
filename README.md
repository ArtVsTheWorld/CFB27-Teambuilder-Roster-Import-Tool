# Teambuilder Roster Import Tool by Ace

Transfers one or more selected College Football 27 Road to Glory rosters into
selected Dynasty teams using position-aware matching. The RTG file is read-only. The Dynasty
file is changed only after a preview, explicit confirmation, backup, validation,
temporary serialization, and successful reopen.

## Install

Install [Node.js 20 or newer](https://nodejs.org/), open a terminal in this folder,
and run:

```powershell
npm install
```

## Run

Interactive mode:

```powershell
npm start
```

Windows users can also double-click `TeambuilderRosterImportTool.bat`. The launcher
checks for Node.js, installs dependencies on the first run, and starts the tool.

Force preview-only mode:

```powershell
npm run dry-run
```

Paste or drag save paths into the prompts. Quoted paths are accepted. Preview mode
never writes a save. Apply mode defaults to No at the final confirmation.

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

## Matching configuration

Edit `src/config/positionFamilies.js` to tune:

- position-family membership;
- within-family preference order;
- cross-family functional costs.

Cross-family scoring also considers height, weight, speed, strength, and
`PlayerType`. Record indices break ties, so identical inputs produce identical
matches.

## Backup and save safety

Apply mode creates a short backup beside the Dynasty save named like
`DYNASTY-MySaveB07181830`. It retains a short, sanitized portion of the original
save name and uses only a compact month/day/hour/minute timestamp. The required
`DYNASTY-` prefix is followed only by letters and numbers, and existing backups
are never overwritten. Changes are applied in memory and validated, serialized to a
temporary save, reopened with `madden-franchise`, validated again, and only then
swapped into the original Dynasty path. If any step fails, the original Dynasty path
is retained and a failure report is written.

## Validation

The tool verifies:

- unchanged player-table record counts;
- one-to-one source and target use;
- every approved value written;
- every unselected player record unchanged;
- every non-approved/unknown field on selected records unchanged;
- `CharacterVisuals` and `CharacterGameplay` unchanged;
- normal target TeamIndex unchanged;
- placeholder TeamIndex changed only to the selected target team;
- created-player selection honored;
- the saved file reopens and serializes successfully.

## Reports

The JSON report includes inputs, counts, missing approved fields, unmatched and
skipped players, every replacement, every changed field, backup path, save result,
and validation checks. The companion CSV contains one row per replacement.

## Known integration risk

No binary RTG/Dynasty fixture was supplied in this workspace, so actual save parsing
could not be integration-tested here. The table UID and schema version come directly
from the supplied `save opening example`. Run preview mode first and test apply mode
on a disposable save. See `docs/IMPLEMENTATION_PLAN.md` for schema details.
