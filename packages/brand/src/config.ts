import { z } from "zod";
import { SLUG_MESSAGE, SLUG_PATTERN } from "./schema.ts";

/** The one file that says which chapter this checkout builds (spec C1). */
export const CONFIG_FILE = "luminova.json";

export const luminovaConfigSchema = z
  .strictObject({
    $schema: z.string().optional(),
    profile: z
      .string()
      .regex(SLUG_PATTERN, SLUG_MESSAGE)
      .describe(
        "The chapter this repository builds and deploys: a folder name under brand/ (lowercase letters, digits and hyphens, e.g. jci-valle). Every pnpm brand:* command, pnpm dev, the builds, the seed scripts and CD read it.",
      ),
  })
  .describe(
    "Luminova's project configuration. Commit it: every machine and CD must build the same chapter.",
  );

export type LuminovaConfig = z.infer<typeof luminovaConfigSchema>;

export const configTemplate = (profile: string) =>
  `${JSON.stringify({ $schema: "./brand/luminova.schema.json", profile }, null, 2)}\n`;

export function renderConfigJsonSchema(): string {
  return `${JSON.stringify(z.toJSONSchema(luminovaConfigSchema, { io: "input" }), null, 2)}\n`;
}
