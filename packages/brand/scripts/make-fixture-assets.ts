// Regenerates brand/fixture/assets/: solid-colour PNGs at the contract sizes, so the
// neutral profile shares no byte with any real chapter's marks.
import { rmSync } from "node:fs";
import { join } from "node:path";
import { writeAssetSet } from "../src/asset-set.ts";
import { ASSET_CONTRACT } from "../src/assets.ts";
import { REPO_ROOT } from "../src/load-profile.ts";

const PRIMARY = [0x33, 0x66, 0x99] as const;
const COLORS: Record<string, readonly [number, number, number]> = {
  "logo-on-dark.png": [0xee, 0xee, 0xee],
  "logo-on-primary.png": [0xff, 0xff, 0xff],
};
const BACKSTAGE_ICON = [0x22, 0x22, 0x22] as const;

const outDir = join(REPO_ROOT, "brand/fixture/assets");
rmSync(outDir, { recursive: true, force: true });
writeAssetSet(
  outDir,
  ({ path }) => COLORS[path] ?? (path.startsWith("backstage/") ? BACKSTAGE_ICON : PRIMARY),
);

console.log(`Wrote ${ASSET_CONTRACT.length} files to brand/fixture/assets/.`);
