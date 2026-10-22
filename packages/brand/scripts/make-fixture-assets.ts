// Regenerates brand/fixture/assets/: solid-colour PNGs at the contract sizes, so the
// neutral profile shares no byte with any real chapter's marks.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { ASSET_CONTRACT, LOGO_FILES } from "../src/assets.ts";
import { REPO_ROOT } from "../src/load-profile.ts";
import { encodePng } from "../src/png.ts";

const LOGO_WIDTH = 400;
const LOGO_HEIGHT = 200;

const COLORS: Record<string, [number, number, number]> = {
  "logo-main.png": [0x33, 0x66, 0x99],
  "logo-on-dark.png": [0xee, 0xee, 0xee],
  "logo-on-primary.png": [0xff, 0xff, 0xff],
  "og-image.png": [0x33, 0x66, 0x99],
};
const SPOTLIGHT_ICON: [number, number, number] = [0x33, 0x66, 0x99];
const BACKSTAGE_ICON: [number, number, number] = [0x22, 0x22, 0x22];

const outDir = join(REPO_ROOT, "brand/fixture/assets");
rmSync(outDir, { recursive: true, force: true });

for (const spec of ASSET_CONTRACT) {
  const isLogo = (LOGO_FILES as readonly string[]).includes(spec.path);
  const width = isLogo ? LOGO_WIDTH : (spec.width ?? LOGO_WIDTH);
  const height = isLogo ? LOGO_HEIGHT : (spec.height ?? LOGO_HEIGHT);
  const color =
    COLORS[spec.path] ?? (spec.path.startsWith("spotlight/") ? SPOTLIGHT_ICON : BACKSTAGE_ICON);
  const file = join(outDir, spec.path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, encodePng(width, height, color));
}

console.log(`Wrote ${ASSET_CONTRACT.length} files to brand/fixture/assets/.`);
