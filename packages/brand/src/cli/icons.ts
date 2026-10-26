import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import sharp from "sharp";
import { ICON_FILES, LOGO_FILES, OG_IMAGE_FILE } from "../assets.ts";
import { BrandConfigError, REPO_ROOT, type LoadedProfile } from "../load-profile.ts";
import { readPngSize } from "../png.ts";
import { BRAND_APPS } from "../ports.ts";
import { PULLED_ASSETS_DIR } from "../release.ts";
import { formatNext, guideStep, type Problem, type Remedy } from "../remedy.ts";
import { runCli } from "./main.ts";

export const ICON_MASTER_FILE = "icon-master.png";
const MIN_MASTER_SIZE = 512;

/**
 * How much of each icon the master fills. A maskable icon may be cropped to a circle of 80%
 * of its width, and a square fits that circle at 0.8 / √2 ≈ 0.56. iOS only rounds the corners.
 */
const FILL: Record<string, { fill: number; opaque: boolean }> = {
  "maskable-icon-512x512.png": { fill: 0.56, opaque: true },
  "apple-touch-icon-180x180.png": { fill: 0.8, opaque: true },
};
const TRANSPARENT_FILL = { fill: 0.9, opaque: false };

const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

const MASTER_REMEDY: Remedy = {
  change: `export your logo mark as ${PULLED_ASSETS_DIR}/${ICON_MASTER_FILE}: a square PNG of at least ${MIN_MASTER_SIZE}×${MIN_MASTER_SIZE}, best on a transparent background (${guideStep("images")})`,
  run: "pnpm brand:icons",
};

export const ICONS_NEXT: readonly Remedy[] = [
  {
    change: `add ${[...LOGO_FILES, OG_IMAGE_FILE].join(", ")} to ${PULLED_ASSETS_DIR}/ if they are not there yet, then check all of it`,
    run: "pnpm brand:check",
  },
];

function masterProblem(file: string): Problem | null {
  const label = `${PULLED_ASSETS_DIR}/${ICON_MASTER_FILE}`;
  if (!existsSync(file)) return { message: `${label}: missing`, remedies: [MASTER_REMEDY] };
  const size = readPngSize(readFileSync(file));
  if (!size) return { message: `${label}: not a PNG`, remedies: [MASTER_REMEDY] };
  const found = `${size.width}×${size.height}`;
  if (size.width !== size.height) {
    return { message: `${label}: ${found} is not square`, remedies: [MASTER_REMEDY] };
  }
  if (size.width < MIN_MASTER_SIZE) {
    return {
      message: `${label}: ${found} is too small (expected at least ${MIN_MASTER_SIZE}×${MIN_MASTER_SIZE})`,
      remedies: [MASTER_REMEDY],
    };
  }
  return null;
}

async function renderIcon(master: Buffer, size: number, name: string, color: string) {
  const { fill, opaque } = FILL[name] ?? TRANSPARENT_FILL;
  const inner = Math.round(size * fill);
  const before = Math.floor((size - inner) / 2);
  const after = size - inner - before;
  const background = opaque ? color : TRANSPARENT;
  const icon = sharp(master)
    .resize(inner, inner, { fit: "contain", background: TRANSPARENT })
    .extend({ top: before, bottom: after, left: before, right: after, background });
  return (opaque ? icon.flatten({ background: color }) : icon).png().toBuffer();
}

/**
 * Renders both apps' icon sets from `brand-assets/icon-master.png`. Checks everything before
 * writing anything, and never replaces an existing icon unless `force` is set.
 * Returns the written paths, relative to the repo.
 */
export async function generateIcons({
  profile,
  repoRoot = REPO_ROOT,
  force = false,
}: {
  profile: LoadedProfile;
  repoRoot?: string;
  force?: boolean;
}): Promise<string[]> {
  const assetsDir = join(repoRoot, PULLED_ASSETS_DIR);
  const masterFile = join(assetsDir, ICON_MASTER_FILE);
  const targets = BRAND_APPS.flatMap((app) =>
    ICON_FILES.map(({ name, size }) => ({ app, name, size, path: `${app}/${name}` })),
  );

  const problems: Problem[] = [];
  const master = masterProblem(masterFile);
  if (master) problems.push(master);
  const existing = force ? [] : targets.filter(({ path }) => existsSync(join(assetsDir, path)));
  if (existing.length > 0) {
    problems.push({
      message: `already there, not overwritten: ${existing.map(({ path }) => `${PULLED_ASSETS_DIR}/${path}`).join(", ")}`,
      remedies: [
        { change: "replace them with icons made from the master", run: "pnpm brand:icons --force" },
      ],
    });
  }
  if (problems.length > 0) throw new BrandConfigError(problems);

  const source = readFileSync(masterFile);
  const rendered = await Promise.all(
    targets.map(async (target) => ({
      ...target,
      png: await renderIcon(source, target.size, target.name, profile.brand.themeColor[target.app]),
    })),
  );
  for (const { path, png } of rendered) {
    const file = join(assetsDir, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, png);
  }
  return rendered.map(({ path }) => `${PULLED_ASSETS_DIR}/${path}`);
}

if (import.meta.main) {
  const force = process.argv.slice(2).includes("--force");
  await runCli("brand:icons", async (profile) => {
    const written = await generateIcons({ profile, force });
    console.log(
      `brand:icons: ${written.length} icons for profile "${profile.slug}" from ${PULLED_ASSETS_DIR}/${ICON_MASTER_FILE}:`,
    );
    for (const path of written) console.log(`  ${path}`);
    console.log(`\n${formatNext(ICONS_NEXT)}`);
  });
}
