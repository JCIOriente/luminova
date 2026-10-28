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
import sharp, { type SharpOptions } from "sharp";
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
import { terminalConfirm, type Confirm } from "./prompts.ts";
import { plural } from "./table.ts";

const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };
const MIN = `${MIN_ICON_MASTER_SIZE}×${MIN_ICON_MASTER_SIZE}`;

type Master = { bytes: Buffer } | { reason: string };

const MASTERS = [
  { file: ICON_MASTER_FILE, kind: "PNG" },
  { file: ICON_MASTER_SVG_FILE, kind: "SVG" },
] as const;
type MasterKind = (typeof MASTERS)[number]["kind"];

/** The master's bytes, or why it cannot be used. A PNG's pixels are only decoded when rendering. */
async function readMaster(path: string, kind: MasterKind): Promise<Master> {
  if (!statSync(path).isFile()) return { reason: "not a file" };
  const bytes = readFileSync(path);
  const reason = kind === "SVG" ? await svgReason(bytes) : masterReason(bytes);
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

/**
 * sharp renders an SVG at the size each icon resizes it to, so any size will do, and its
 * pixel limit, meant for decoded rasters, would only refuse a large declared size.
 */
const SVG_INPUT = { limitInputPixels: false } as const;

async function svgReason(bytes: Buffer): Promise<string | null> {
  try {
    const { format, width, height } = await sharp(bytes, SVG_INPUT).metadata();
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
  input: SharpOptions,
): Promise<Buffer> {
  const inner = Math.round(size * fill);
  const before = Math.floor((size - inner) / 2);
  const after = size - inner - before;
  const background = opaque ? color : TRANSPARENT;
  // sharp flattens before it extends, so the padding needs the colour too.
  const icon = sharp(master, input)
    .resize(inner, inner, { fit: "contain", background: TRANSPARENT })
    .extend({ top: before, bottom: after, left: before, right: after, background });
  return (opaque ? icon.flatten({ background: color }) : icon).png().toBuffer();
}

const tempOf = (file: string) => join(dirname(file), `.${basename(file)}.tmp`);

const removeTemps = (files: readonly string[]) => {
  for (const temp of files.map(tempOf)) if (existsSync(temp)) rmSync(temp);
};

/**
 * Writes every icon to a hidden file beside its target, then renames them all into place, so
 * a failed write changes no icon. Only a failed rename, after every write worked, can leave
 * part of the set replaced; the error says how much.
 */
function writeIcons(icons: readonly { file: string; png: Buffer }[], label: string): void {
  const files = icons.map(({ file }) => file);
  for (const [index, { file, png }] of icons.entries()) {
    try {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(tempOf(file), png);
    } catch (error) {
      // The failing icon's own temporary file may exist half-written.
      removeTemps(files.slice(0, index + 1));
      throw new BrandConfigError([
        {
          message: `could not write the icons, so no icon changed: ${errorMessage(error)}`,
          remedies: [
            {
              change: `make sure ${label}/ and its folders can be written`,
              run: "pnpm brand:icons",
            },
          ],
        },
      ]);
    }
  }
  for (const [index, file] of files.entries()) {
    try {
      renameSync(tempOf(file), file);
    } catch (error) {
      removeTemps(files.slice(index));
      throw new BrandConfigError([
        {
          message: `${index} of ${files.length} icons replaced, then: ${errorMessage(error)}`,
          remedies: [
            {
              change: "fix what stopped it, then run it again and answer y to finish the set",
              run: "pnpm brand:icons",
            },
          ],
        },
      ]);
    }
  }
}

/**
 * Renders both apps' icon sets from `brand-assets/icon-master.png` or `icon-master.svg`.
 * Checks the master and renders every icon before writing any. Icons already there are
 * replaced only when `confirmReplace` says yes; without it (no terminal) nothing is written.
 * Returns the written paths as the user sees them: none when the answer was no.
 */
export async function generateIcons({
  profile,
  repoRoot = REPO_ROOT,
  confirmReplace,
}: {
  profile: LoadedProfile;
  repoRoot?: string;
  confirmReplace?: Confirm;
}): Promise<string[]> {
  const assetsDir = join(repoRoot, PULLED_ASSETS_DIR);
  const label = displayDir(repoRoot, assetsDir);
  const targets = BRAND_APPS.flatMap((app) =>
    ICON_FILES.map((icon) => ({ app, icon, path: `${app}/${icon.name}` })),
  );

  const found = MASTERS.filter(({ file }) => existsSync(join(assetsDir, file)));
  const only = found.length === 1 ? found[0] : undefined;
  const masterLabel = `${label}/${only?.file ?? `${ICON_MASTER_FILE} or ${ICON_MASTER_SVG_FILE}`}`;
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
  let master: Master | undefined;
  if (found.length > 1) {
    problems.push({
      message: `${label}/${ICON_MASTER_FILE} and ${label}/${ICON_MASTER_SVG_FILE} are both there`,
      remedies: [{ change: "keep one master and delete the other", run: "pnpm brand:icons" }],
    });
  } else {
    master = only ? await readMaster(join(assetsDir, only.file), only.kind) : { reason: "missing" };
    if ("reason" in master) problems.push(masterProblem(master.reason));
  }
  if (!master || !("bytes" in master) || problems.length > 0) throw new BrandConfigError(problems);
  const { bytes } = master;
  const existing = targets.filter(({ path }) => existsSync(join(assetsDir, path)));
  if (existing.length > 0) {
    if (!confirmReplace) {
      throw new BrandConfigError([
        {
          message: `already there, not replaced: ${existing.map(({ path }) => `${label}/${path}`).join(", ")}`,
          remedies: [
            {
              change:
                "run it in a terminal and answer y to replace them with icons made from the master",
              run: "pnpm brand:icons",
            },
          ],
        },
      ]);
    }
    const question = `Replace the ${plural(existing.length, "icon")} already in ${label}/ with icons made from ${only?.file ?? ICON_MASTER_FILE}?`;
    if (!(await confirmReplace(question))) return [];
  }
  const input = only?.kind === "SVG" ? SVG_INPUT : {};

  let icons: { file: string; png: Buffer }[];
  try {
    icons = await Promise.all(
      targets.map(async ({ app, icon, path }) => ({
        file: join(assetsDir, path),
        png: await renderIcon(bytes, icon, profile.brand.themeColor[app], input),
      })),
    );
  } catch (error) {
    // The header check passed, so sharp is the first to read the pixels.
    throw new BrandConfigError([
      masterProblem(`not a readable ${only?.kind ?? "PNG"} (${errorMessage(error)})`),
    ]);
  }
  writeIcons(icons, label);
  return targets.map(({ path }) => `${label}/${path}`);
}

const NEXT: readonly Remedy[] = [
  {
    change: `add ${[...LOGO_FILES, OG_IMAGE_FILE].join(", ")} to ${PULLED_ASSETS_DIR}/ if they are not there yet, then check all of it`,
    run: "pnpm brand:check",
  },
];

if (import.meta.main) {
  await runCli("brand:icons", {}, async (profile) => {
    const written = await generateIcons({ profile, confirmReplace: terminalConfirm() });
    if (written.length === 0) {
      console.log(`brand:icons: kept the icons in ${PULLED_ASSETS_DIR}/; nothing changed.`);
      return;
    }
    console.log(
      `brand:icons: ${written.length} icons for profile "${profile.slug}" from the master in ${PULLED_ASSETS_DIR}/:`,
    );
    for (const path of written) console.log(`  ${path}`);
    console.log(`\n${formatNext(NEXT)}`);
  });
}
