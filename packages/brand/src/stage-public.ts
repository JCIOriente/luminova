import { createHash } from "node:crypto";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { ICON_FILES, OG_IMAGE_FILE } from "./assets.ts";
import type { BrandApp } from "./ports.ts";
import type { Brand } from "./schema.ts";

const SERVICE_WORKER_FILE = "firebase-messaging-sw.js";

export interface StagePublicOptions {
  appPublicDir: string;
  assetsDir: string;
  app: BrandApp;
  brand: Pick<Brand, "name" | "og">;
  outDir: string;
}

/** Builds the public dir Vite serves: the app's own files, its icon set and, for spotlight, the OG image. */
export function stagePublic({ appPublicDir, assetsDir, app, brand, outDir }: StagePublicOptions): {
  ogImageFile: string;
} {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  if (existsSync(appPublicDir)) cpSync(appPublicDir, outDir, { recursive: true });

  for (const { name } of ICON_FILES) {
    copyFileSync(join(assetsDir, app, name), join(outDir, name));
  }

  let ogImageFile = "";
  if (app === "spotlight") {
    const bytes = readFileSync(join(assetsDir, OG_IMAGE_FILE));
    const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 8);
    ogImageFile = `og-image.${hash}.png`;
    for (const name of [ogImageFile, ...brand.og.legacyPaths]) {
      writeFileSync(join(outDir, name), bytes);
    }
  }

  const serviceWorker = join(outDir, SERVICE_WORKER_FILE);
  if (existsSync(serviceWorker)) {
    // The placeholder sits inside a double-quoted JS string, so splice in JSON's escaped body.
    const name = JSON.stringify(brand.name).slice(1, -1);
    const source = readFileSync(serviceWorker, "utf8");
    writeFileSync(
      serviceWorker,
      source.replaceAll("__BRAND_NAME__", () => name),
    );
  }

  return { ogImageFile };
}
