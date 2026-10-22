import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { ASSET_CONTRACT, type AssetSpec } from "./assets.ts";
import { encodePng } from "./png.ts";

export const FIXTURE_LOGO_SIZE = { width: 400, height: 200 } as const;

type Rgb = readonly [number, number, number];

/** Writes a solid-colour PNG for every file in the asset contract, logos at 400×200. */
export function writeAssetSet(
  dir: string,
  colorFor: (spec: AssetSpec, index: number) => Rgb = () => [0x33, 0x66, 0x99],
): void {
  ASSET_CONTRACT.forEach((spec, index) => {
    const file = join(dir, spec.path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(
      file,
      encodePng(
        spec.width ?? FIXTURE_LOGO_SIZE.width,
        spec.height ?? FIXTURE_LOGO_SIZE.height,
        colorFor(spec, index),
      ),
    );
  });
}
