import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import sharp from "sharp";
import {
  ICON_FILES,
  ICON_MASTER_FILE,
  LOGO_FILES,
  MIN_ICON_MASTER_SIZE,
  OG_IMAGE_FILE,
} from "../assets.ts";
import { BrandConfigError, REPO_ROOT, errorMessage, type LoadedProfile } from "../load-profile.ts";
import { readPngSize } from "../png.ts";
import { BRAND_APPS } from "../ports.ts";
import { PULLED_ASSETS_DIR, displayDir } from "../release.ts";
import { formatNext, guideStep, type Problem, type Remedy } from "../remedy.ts";
import { runCli } from "./main.ts";

const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };
const MIN = `${MIN_ICON_MASTER_SIZE}×${MIN_ICON_MASTER_SIZE}`;

/** The master's bytes, or why it cannot be used. Its pixels are only decoded when rendering. */
function readMaster(file: string): { bytes: Buffer } | { reason: string } {
  if (!existsSync(file)) return { reason: "missing" };
  if (!statSync(file).isFile()) return { reason: "not a file" };
  const bytes = readFileSync(file);
  const reason = masterReason(bytes);
  return reason ? { reason } : { bytes };
}

function masterReason(bytes: Buffer): string | null {
  const size = readPngSize(bytes);
  if (!size) return "not a PNG";
  const found = `${size.width}×${size.height}`;
  if (size.width !== size.height) return `${found} is not square`;
  if (size.width < MIN_ICON_MASTER_SIZE) return `${found} is too small (expected at least ${MIN})`;
  return null;
}

async function renderIcon(
  master: Buffer,
  { size, fill, opaque }: (typeof ICON_FILES)[number],
  color: string,
): Promise<Buffer> {
  const inner = Math.round(size * fill);
  const before = Math.floor((size - inner) / 2);
  const after = size - inner - before;
  const background = opaque ? color : TRANSPARENT;
  // sharp flattens before it extends, so the padding needs the colour too.
  const icon = sharp(master)
    .resize(inner, inner, { fit: "contain", background: TRANSPARENT })
    .extend({ top: before, bottom: after, left: before, right: after, background });
  return (opaque ? icon.flatten({ background: color }) : icon).png().toBuffer();
}

/**
 * Renders both apps' icon sets from `brand-assets/icon-master.png`. Checks the master and the
 * targets and renders every icon before writing any; never replaces an icon unless `force`.
 * Returns the written paths as the user sees them.
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
  const label = displayDir(repoRoot, assetsDir);
  const masterFile = join(assetsDir, ICON_MASTER_FILE);
  const targets = BRAND_APPS.flatMap((app) =>
    ICON_FILES.map((icon) => ({ app, icon, path: `${app}/${icon.name}` })),
  );

  const masterLabel = `${label}/${ICON_MASTER_FILE}`;
  const masterProblem = (reason: string): Problem => ({
    message: `${masterLabel}: ${reason}`,
    remedies: [
      {
        change: `export your logo mark as ${masterLabel}: a square PNG of at least ${MIN}, best on a transparent background (${guideStep("images")})`,
        run: "pnpm brand:icons",
      },
    ],
  });

  const problems: Problem[] = [];
  const master = readMaster(masterFile);
  if ("reason" in master) problems.push(masterProblem(master.reason));
  const existing = force ? [] : targets.filter(({ path }) => existsSync(join(assetsDir, path)));
  if (existing.length > 0) {
    problems.push({
      message: `already there, not overwritten: ${existing.map(({ path }) => `${label}/${path}`).join(", ")}`,
      remedies: [
        { change: "replace them with icons made from the master", run: "pnpm brand:icons --force" },
      ],
    });
  }
  if (!("bytes" in master) || problems.length > 0) throw new BrandConfigError(problems);

  let rendered: { path: string; png: Buffer }[];
  try {
    rendered = await Promise.all(
      targets.map(async ({ app, icon, path }) => ({
        path,
        png: await renderIcon(master.bytes, icon, profile.brand.themeColor[app]),
      })),
    );
  } catch (error) {
    // The header check passed, so sharp is the first to read the pixels.
    throw new BrandConfigError([masterProblem(`not a readable PNG (${errorMessage(error)})`)]);
  }
  for (const { path, png } of rendered) {
    const file = join(assetsDir, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, png);
  }
  return rendered.map(({ path }) => `${label}/${path}`);
}

const NEXT: readonly Remedy[] = [
  {
    change: `add ${[...LOGO_FILES, OG_IMAGE_FILE].join(", ")} to ${PULLED_ASSETS_DIR}/ if they are not there yet, then check all of it`,
    run: "pnpm brand:check",
  },
];

if (import.meta.main) {
  const force = process.argv.slice(2).includes("--force");
  await runCli("brand:icons", async (profile) => {
    const written = await generateIcons({ profile, force });
    console.log(
      `brand:icons: ${written.length} icons for profile "${profile.slug}" from ${PULLED_ASSETS_DIR}/${ICON_MASTER_FILE}:`,
    );
    for (const path of written) console.log(`  ${path}`);
    console.log(`\n${formatNext(NEXT)}`);
  });
}
