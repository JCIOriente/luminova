import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderBrandJsonSchema } from "../schema.ts";

const target = fileURLToPath(new URL("../../../../brand/brand.schema.json", import.meta.url));
const expected = renderBrandJsonSchema();

if (process.argv.includes("--check")) {
  let committed = "";
  try {
    committed = readFileSync(target, "utf8");
  } catch (error) {
    console.error(error);
  }
  if (committed !== expected) {
    console.error("brand/brand.schema.json is stale: run `pnpm brand:schema` and commit it.");
    process.exit(1);
  }
  console.log("brand/brand.schema.json is up to date.");
} else {
  writeFileSync(target, expected);
  console.log("Wrote brand/brand.schema.json.");
}
