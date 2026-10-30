// Test-only: repo roots that hold the committed example and a connected chapter made from it,
// so no test depends on a real chapter's profile being in git.
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stringify } from "smol-toml";
import { writeAssetSet } from "./asset-set.ts";
import { BRAND_FILE, SCHEMA_LINE, parseBrandToml } from "./brand-file.ts";
import {
  BrandConfigError,
  EXAMPLE_PROFILE,
  REPO_ROOT,
  brandFileLabel,
  loadProfile,
  type LoadedProfile,
} from "./load-profile.ts";
import { fileSha256 } from "./hash.ts";
import {
  BUCKET_CONTRACT,
  LOCAL_PROFILE,
  localDir,
  writeManifest,
  type ObjectRecord,
} from "./local-folder.ts";
import type { Table } from "./schema.ts";

/** A chapter on a real (fictional) project, with CD's sign-in: everything a deploy needs. */
export const TEST_CHAPTER = "jci-valle";

/** The committed example's brand.toml, parsed: a complete file. */
export const exampleToml = (): Table =>
  parseBrandToml(
    readFileSync(join(REPO_ROOT, "brand", EXAMPLE_PROFILE, BRAND_FILE), "utf8"),
    brandFileLabel(EXAMPLE_PROFILE),
  );

/** The BrandConfigError `run` throws; anything else it throws, or no throw, fails the test. */
export function brandErrorOf(run: () => unknown): BrandConfigError {
  try {
    run();
  } catch (error) {
    if (error instanceof BrandConfigError) return error;
    throw error;
  }
  throw new Error("expected a BrandConfigError");
}

/** The error lines of the BrandConfigError `run` throws. */
export const errorsOf = (run: () => unknown): string[] => brandErrorOf(run).errors;

/** The files under brand/ that every repository has: the example and the shared two. */
const SHARED_BRAND_PATHS = [EXAMPLE_PROFILE, "brand.schema.json", "bucket-lifecycle.json"];

/** The test chapter's brand.toml: only what differs from the example, as a chapter writes it. */
const CHAPTER_FILE = {
  name: "JCI Valle",
  city: "Villa Valle",
  country: "Bolivia",
  project: "jci-valle",
  legalName: "Cámara Junior Internacional Valle",
  description: "Junior Chamber International Valle",
  foundedYear: 1990,
  broadcastChannelName: "Difusión Valle",
  qrPrefix: "jcivalle",
  colors: { spotlight: "#0097D7", backstage: "#130F2D" },
  locality: {
    cityFormal: "Villa Valle de Prueba",
    region: "el valle central",
    regionShort: "el valle",
  },
  urls: {
    spotlight: "https://jcivalle.example.org",
    backstage: "https://admin.jcivalle.example.org",
  },
  seo: {
    description: "JCI Valle, capítulo Villa Valle de la Cámara Junior Internacional.",
    ogDescription: "Formamos líderes con propósito en el valle central desde 1990.",
    twitterDescription: "Formamos líderes en el valle central desde 1990.",
  },
  backstage: {
    emailPlaceholder: "tu.nombre@jcivalle.example.org",
    contactEmail: "hola@jcivalle.example.org",
  },
  contact: {
    email: "contacto@jcivalle.example.org",
    mapUrl: "https://maps.example.org/jci-valle",
  },
  og: { legacyPaths: ["og-image-v3.png"] },
  firebase: {
    sites: { spotlight: "jcivalle", backstage: "jcivalle-backstage" },
    spotlight: {
      apiKey: "AIzaTestValleSpotlightKey",
      appId: "1:123456789012:web:valle01",
      appCheckSiteKey: "6LTestValleSpotlightSiteKey",
    },
    backstage: {
      apiKey: "AIzaTestValleBackstageKey",
      appId: "1:123456789012:web:valle02",
      appCheckSiteKey: "6LTestValleBackstageSiteKey",
    },
  },
  deploy: {
    workloadIdentityProvider:
      "projects/123456789012/locations/global/workloadIdentityPools/github-actions/providers/github-oidc",
    serviceAccount: "firebase-deployer@jci-valle.iam.gserviceaccount.com",
  },
};

/** The chapter's own images: solid colours no example image shares. */
const CHAPTER_COLOR = [0x00, 0x97, 0xd7] as const;

/**
 * A temporary repo root whose brand/ holds what upstream ships: the example and the shared
 * files, with the example's images unless `assets` is false.
 */
export function exampleRepo(
  prefix = "brand-test-",
  { assets = true }: { assets?: boolean } = {},
): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  mkdirSync(join(root, "brand"));
  const exampleAssets = join(REPO_ROOT, "brand", EXAMPLE_PROFILE, "assets");
  for (const path of SHARED_BRAND_PATHS) {
    cpSync(join(REPO_ROOT, "brand", path), join(root, "brand", path), {
      recursive: true,
      filter: (source) => assets || source !== exampleAssets,
    });
  }
  return root;
}

/**
 * Writes `brand/<slug>/` into `root`: the chapter's brand.toml (with `brand`'s top-level
 * keys replacing the test chapter's) and, unless `assets` is false, the chapter's own
 * images: flat in brand/local/, in `assets/` of a committed chapter folder. Returns the
 * profile folder.
 */
export function writeChapter(
  root: string,
  {
    slug = TEST_CHAPTER,
    assets = true,
    brand = {},
  }: { slug?: string; assets?: boolean; brand?: Record<string, unknown> } = {},
): string {
  const dir = join(root, "brand", slug);
  mkdirSync(dir, { recursive: true });
  const file = Object.fromEntries(
    Object.entries({ ...structuredClone(CHAPTER_FILE), ...brand }).filter(
      ([, value]) => value !== undefined,
    ),
  );
  writeFileSync(join(dir, BRAND_FILE), `${SCHEMA_LINE}\n${stringify(file)}\n`);
  if (assets)
    writeAssetSet(slug === LOCAL_PROFILE ? dir : join(dir, "assets"), () => CHAPTER_COLOR);
  return dir;
}

/**
 * A repo root with the example and the test chapter committed in brand/, which brand/ then
 * selects. TRANSITIONAL (the JCI Oriente removal PR drops this).
 */
export function chapterRepo(prefix = "brand-chapter-"): string {
  const root = exampleRepo(prefix);
  writeChapter(root);
  return root;
}

/** A repo root with the example and the test chapter in brand/local/, which brand/ then selects. */
export function localRepo(prefix = "brand-local-"): string {
  const root = exampleRepo(prefix);
  writeChapter(root, { slug: LOCAL_PROFILE });
  return root;
}

let shared: LoadedProfile | undefined;
let sharedLocal: LoadedProfile | undefined;

/** The test chapter in brand/local/, as brand/ selects it, loaded once per test file. */
export function localProfile(): LoadedProfile {
  if (sharedLocal === undefined) {
    const root = localRepo();
    process.once("exit", () => rmSync(root, { recursive: true, force: true }));
    sharedLocal = loadProfile({ repoRoot: root, env: {} });
  }
  return sharedLocal;
}

/**
 * The test chapter committed in brand/, as brand/ selects it, loaded once per test file from
 * a repo root removed on exit. TRANSITIONAL (the JCI Oriente removal PR drops this).
 */
export function chapterProfile(): LoadedProfile {
  if (shared === undefined) {
    const root = chapterRepo();
    process.once("exit", () => rmSync(root, { recursive: true, force: true }));
    shared = loadProfile({ repoRoot: root, env: {} });
  }
  return shared;
}

/**
 * Records the contract files brand/local/ holds in its manifest, as brand:pull (source
 * `bucket`, a generation each) or the seed (source `example`) would.
 */
export function recordLocal(
  root: string,
  {
    source = "bucket",
    project = TEST_CHAPTER,
  }: { source?: ObjectRecord["source"]; project?: string } = {},
): void {
  const dir = localDir(root);
  const objects: Record<string, ObjectRecord> = {};
  BUCKET_CONTRACT.forEach((path, index) => {
    if (!existsSync(join(dir, path))) return;
    const sha256 = fileSha256(join(dir, path));
    objects[path] =
      source === "bucket"
        ? { source, generation: String(1000 + index), sha256 }
        : { source, sha256 };
  });
  writeManifest(dir, { version: 1, project, bucket: `${project}-brand-assets`, objects });
}
