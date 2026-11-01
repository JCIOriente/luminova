import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderBrandJsonSchema } from "../schema.ts";
import { runBrandCommand } from "./main.ts";

const SCHEMA_FILE = "brand/brand.schema.json";

if (import.meta.main) {
  await runBrandCommand("brand:schema", () => {
    writeFileSync(
      fileURLToPath(new URL(`../../../../${SCHEMA_FILE}`, import.meta.url)),
      renderBrandJsonSchema(),
    );
    console.log(`Wrote ${SCHEMA_FILE}.`);
  });
}
