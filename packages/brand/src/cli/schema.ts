import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderBrandJsonSchema } from "../schema.ts";
import { runBrandCommand } from "./main.ts";

const SCHEMAS = [["brand/brand.schema.json", renderBrandJsonSchema()]] as const;

const target = (path: string) => fileURLToPath(new URL(`../../../../${path}`, import.meta.url));

function committed(path: string): string {
  try {
    return readFileSync(target(path), "utf8");
  } catch (error) {
    console.error(error);
    return "";
  }
}

if (import.meta.main) {
  await runBrandCommand("brand:schema", { switches: ["--check"] }, (args) => {
    if (args.has("--check")) {
      const stale = SCHEMAS.filter(([path, expected]) => committed(path) !== expected);
      for (const [path] of stale) {
        console.error(`${path} is stale: run \`pnpm brand:schema\` and commit it.`);
      }
      if (stale.length > 0) process.exit(1);
      console.log(`Up to date: ${SCHEMAS.map(([path]) => path).join(", ")}.`);
    } else {
      for (const [path, expected] of SCHEMAS) {
        writeFileSync(target(path), expected);
        console.log(`Wrote ${path}.`);
      }
    }
  });
}
