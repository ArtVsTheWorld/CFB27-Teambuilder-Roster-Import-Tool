import path from "node:path";
import { fileURLToPath } from "node:url";
import maddenPackage from "madden-franchise";
import { SCHEMA_VERSION } from "../config/constants.js";

const Franchise = maddenPackage.default || maddenPackage;
const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
export const SCHEMA_DIRECTORY = path.resolve(currentDirectory, "../../engine-data");

function schemaOverride() {
  return {
    ...SCHEMA_VERSION,
    path: path.join(SCHEMA_DIRECTORY, "C27_472_0.gz"),
  };
}

// Mirrors the proven save-opening settings in the supplied example. autoUnempty
// stays disabled because roster expansion uses real, nonempty Omar Omar records.
export async function openSave(savePath) {
  return Franchise.create(savePath, {
    schemaDirectory: SCHEMA_DIRECTORY,
    schemaOverride: schemaOverride(),
    autoUnempty: false,
  });
}
