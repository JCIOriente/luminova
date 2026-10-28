import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderBrandJsonSchema } from "../schema.ts";
import { runBrandCommand } from "./main.ts";

const SCHEMAS = [["brand/brand.schema.json", renderBrandJsonSchema()]] as const;

const target = (path: string) => fileURLToPath(new URL(`../../../../${path}`, import.meta.url));

if (import.meta.main) {
  await runBrandCommand("brand:schema", () => {
    for (const [path, expected] of SCHEMAS) {
      writeFileSync(target(path), expected);
      console.log(`Wrote ${path}.`);
    }
  });
}
