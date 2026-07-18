import chalk from "chalk";

const pad = (label) => label.padEnd(14, " ");

export const log = Object.freeze({
  info(message) {
    console.log(chalk.gray(message));
  },
  success(message) {
    console.log(chalk.green(message));
  },
  warn(message) {
    console.log(chalk.yellow(message));
  },
  error(message) {
    console.error(chalk.red(message));
  },
  skipped(message) {
    console.log(chalk.cyan(`${pad("[SKIPPED]")} ${message}`));
  },
  replacement(match) {
    const label = `[${match.matchType}]`;
    const line = `${pad(label)} ${match.targetName} (${match.targetPosition}) -> ${match.sourceName} (${match.sourcePosition})`;
    if (match.matchType === "EXACT") console.log(chalk.green(line));
    else if (match.matchType === "FAMILY") console.log(chalk.yellow(line));
    else console.log(chalk.red(line));
  },
  replacementTableRow(line, matchType) {
    if (matchType === "EXACT") console.log(chalk.green(line));
    else if (matchType === "FAMILY") console.log(chalk.yellow(line));
    else console.log(chalk.red(line));
  },
});
