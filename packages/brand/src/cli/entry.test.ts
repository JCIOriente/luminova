import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const CLI_DIR = fileURLToPath(new URL(".", import.meta.url));
const entries = readdirSync(CLI_DIR).filter(
  (file) => file.endsWith(".ts") && !file.endsWith(".test.ts"),
);

// Vitest shares one module graph across a file's imports, which hides an import cycle that
// only breaks when a module is the first one Node loads. Each CLI starts that way.
describe("every CLI module loads first in a fresh Node, and runs nothing", () => {
  it.each(entries)("%s", (file) => {
    const url = new URL(file, new URL(`file://${CLI_DIR}`)).href;
    const output = execFileSync(
      process.execPath,
      ["--input-type=module", "-e", `await import(${JSON.stringify(url)})`],
      { stdio: "pipe", encoding: "utf8" },
    );
    expect(output).toBe("");
  });
});
