import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import sharp from "sharp";
import {
  ICON_FILES,
  ICON_MASTER_FILE,
  ICON_MASTER_SVG_FILE,
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

type Master = { bytes: Buffer } | { reason: string };

/** The master's bytes, or why it cannot be used. A PNG's pixels are only decoded when rendering. */
async function readMaster(file: string): Promise<Master> {
  if (!statSync(file).isFile()) return { reason: "not a file" };
  const bytes = readFileSync(file);
  const reason = file.endsWith(ICON_MASTER_SVG_FILE) ? await svgReason(bytes) : masterReason(bytes);
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

/** Any size will do: sharp renders an SVG at the size each icon resizes it to. */
async function svgReason(bytes: Buffer): Promise<string | null> {
  try {
    const { format, width, height } = await sharp(bytes).metadata();
    if (format !== "svg" || !width || !height) return "not a readable SVG";
    return width === height ? null : `${width}×${height} is not square`;
  } catch (error) {
    return `not a readable SVG (${errorMessage(error)})`;
  }
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

interface Staged {
  file: string;
  temp: string;
  png: Buffer;
}

const removeTemps = (staged: readonly Staged[]) => {
  for (const { temp } of staged) rmSync(temp, { force: true });
};

/**
 * Writes every icon to a hidden file beside its target, then renames them all into place, so
 * a failed write changes no icon. Only a failed rename, after every write worked, can leave
 * part of the set replaced; the error says how much.
 */
function writeIcons(icons: readonly { file: string; png: Buffer }[], label: string): void {
  const written: Staged[] = [];
  try {
    for (const { file, png } of icons) {
      const temp = join(dirname(file), `.${basename(file)}.tmp`);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(temp, png);
      written.push({ file, temp, png });
    }
  } catch (error) {
    removeTemps(written);
    throw new BrandConfigError([
      {
        message: `could not write the icons, so no icon changed: ${errorMessage(error)}`,
        remedies: [
          { change: `make sure ${label}/ and its folders can be written`, run: "pnpm brand:icons" },
        ],
      },
    ]);
  }
  let replaced = 0;
  try {
    for (const { temp, file } of written) {
      renameSync(temp, file);
      replaced += 1;
    }
  } catch (error) {
    removeTemps(written.slice(replaced));
    throw new BrandConfigError([
      {
        message: `${replaced} of ${written.length} icons replaced, then: ${errorMessage(error)}`,
        remedies: [
          { change: "fix what stopped it, then finish the set", run: "pnpm brand:icons --force" },
        ],
      },
    ]);
  }
}

/**
 * Renders both apps' icon sets from `brand-assets/icon-master.png` or `icon-master.svg`.
 * Checks the master and the targets and renders every icon before writing any; never
 * replaces an icon unless `force`. Returns the written paths as the user sees them.
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
  const targets = BRAND_APPS.flatMap((app) =>
    ICON_FILES.map((icon) => ({ app, icon, path: `${app}/${icon.name}` })),
  );

  const masters = [ICON_MASTER_FILE, ICON_MASTER_SVG_FILE].filter((name) =>
    existsSync(join(assetsDir, name)),
  );
  const masterLabel = `${label}/${masters.length === 1 ? masters[0] : `${ICON_MASTER_FILE} or ${ICON_MASTER_SVG_FILE}`}`;
  const masterProblem = (reason: string): Problem => ({
    message: `${masterLabel}: ${reason}`,
    remedies: [
      {
        change: `export your logo mark as ${label}/${ICON_MASTER_SVG_FILE} (square) or ${ICON_MASTER_FILE} (a square PNG of at least ${MIN}), best on a transparent background (${guideStep("images")})`,
        run: "pnpm brand:icons",
      },
    ],
  });

  const problems: Problem[] = [];
  let master: Master = { reason: "missing" };
  if (masters.length > 1) {
    master = { reason: "both are there" };
    problems.push({
      message: `${label}/${ICON_MASTER_FILE} and ${label}/${ICON_MASTER_SVG_FILE} are both there`,
      remedies: [{ change: "keep one master and delete the other", run: "pnpm brand:icons" }],
    });
  } else {
    if (masters[0]) master = await readMaster(join(assetsDir, masters[0]));
    if ("reason" in master) problems.push(masterProblem(master.reason));
  }
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
    const kind = masters[0] === ICON_MASTER_SVG_FILE ? "SVG" : "PNG";
    throw new BrandConfigError([masterProblem(`not a readable ${kind} (${errorMessage(error)})`)]);
  }
  writeIcons(
    rendered.map(({ path, png }) => ({ file: join(assetsDir, path), png })),
    label,
  );
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
