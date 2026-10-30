// Test-only: repo roots that hold the committed example and a connected chapter made from it,
// so no test depends on a real chapter's profile being in git.
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeAssetSet } from "./asset-set.ts";
import { EXAMPLE_PROFILE, REPO_ROOT, loadProfile, type LoadedProfile } from "./load-profile.ts";

/** A chapter on a real (fictional) project, with CD's sign-in: everything a deploy needs. */
export const TEST_CHAPTER = "jci-valle";

/** The files under brand/ that every repository has: the example and the shared two. */
const SHARED_BRAND_PATHS = [EXAMPLE_PROFILE, "brand.schema.json", "bucket-lifecycle.json"];

const CHAPTER_VALUES = {
  name: "JCI Valle",
  shortName: "JCI Valle",
  legalName: "Cámara Junior Internacional Valle",
  description: "Junior Chamber International Valle",
  locality: {
    city: "Villa Valle",
    cityFormal: "Villa Valle de Prueba",
    region: "el valle central",
    regionShort: "el valle",
    country: "Bolivia",
  },
  foundedYear: 1990,
  broadcastChannelName: "Difusión Valle",
  urls: {
    spotlight: "https://jcivalle.example.org",
    backstage: "https://admin.jcivalle.example.org",
  },
  qrPrefix: "jcivalle",
  themeColor: { spotlight: "#0097D7", backstage: "#130F2D" },
  seo: {
    title: "JCI Valle: Cámara Junior Internacional en Villa Valle",
    description: "JCI Valle, capítulo Villa Valle de la Cámara Junior Internacional.",
    ogTitle: "JCI Valle: Cámara Junior Internacional en Villa Valle",
    ogDescription: "Formamos líderes con propósito en el valle central desde 1990.",
    ogImageAlt: "JCI Valle: jóvenes que lideran con propósito en Villa Valle.",
    twitterDescription: "Formamos líderes en el valle central desde 1990.",
  },
  backstage: {
    title: "JCI Valle — Portal de miembros",
    emailPlaceholder: "tu.nombre@jcivalle.example.org",
    contactEmail: "hola@jcivalle.example.org",
  },
  og: { legacyPaths: ["og-image-v3.png"] },
  firebase: {
    projectId: "jci-valle",
    storageBucket: "jci-valle.firebasestorage.app",
    sites: { spotlight: "jcivalle", backstage: "jcivalle-backstage" },
    web: {
      authDomain: "jci-valle.firebaseapp.com",
      messagingSenderId: "123456789012",
      spotlight: {
        apiKey: "AIzaTestValleSpotlightKey",
        appId: "1:123456789012:web:valle01",
        appCheckSiteKey: "6LTestValleSpotlightSiteKey",
        vapidKey: "",
      },
      backstage: {
        apiKey: "AIzaTestValleBackstageKey",
        appId: "1:123456789012:web:valle02",
        appCheckSiteKey: "6LTestValleBackstageSiteKey",
        vapidKey: "",
      },
    },
  },
  assetsBucket: "jci-valle-brand-assets",
  deploy: {
    workloadIdentityProvider:
      "projects/123456789012/locations/global/workloadIdentityPools/github-actions/providers/github-oidc",
    serviceAccount: "firebase-deployer@jci-valle.iam.gserviceaccount.com",
  },
};

/** The chapter's own images: solid colours no example image shares. */
const CHAPTER_COLOR = [0x00, 0x97, 0xd7] as const;

/** The example's brand.json as written in git. */
function exampleJson(): Record<string, unknown> {
  return JSON.parse(readFileSync(join(REPO_ROOT, "brand", EXAMPLE_PROFILE, "brand.json"), "utf8"));
}

/** The test chapter's brand.json: the example with every chapter value replaced. */
function chapterJson(slug = TEST_CHAPTER): Record<string, unknown> {
  return { ...exampleJson(), ...structuredClone(CHAPTER_VALUES), slug };
}

/** A temporary repo root whose brand/ holds what upstream ships: the example and the shared files. */
export function exampleRepo(prefix = "brand-test-"): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  mkdirSync(join(root, "brand"));
  for (const path of SHARED_BRAND_PATHS) {
    cpSync(join(REPO_ROOT, "brand", path), join(root, "brand", path), { recursive: true });
  }
  return root;
}

/**
 * Writes `brand/<slug>/` into `root`: the chapter's brand.json, the example's site content
 * and, unless `assets` is false, the chapter's own images. Returns the profile folder.
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
  writeFileSync(
    join(dir, "brand.json"),
    `${JSON.stringify({ ...chapterJson(slug), ...brand }, null, 2)}\n`,
  );
  cpSync(
    join(REPO_ROOT, "brand", EXAMPLE_PROFILE, "site-content.json"),
    join(dir, "site-content.json"),
  );
  if (assets) writeAssetSet(join(dir, "assets"), () => CHAPTER_COLOR);
  return dir;
}

/** A repo root with the example and the test chapter, which brand/ then selects. */
export function chapterRepo(prefix = "brand-chapter-"): string {
  const root = exampleRepo(prefix);
  writeChapter(root);
  return root;
}

let shared: string | undefined;

/** The test chapter, loaded from one repo root shared by the whole test file and removed on exit. */
export function chapterProfile(): LoadedProfile {
  if (shared === undefined) {
    const root = chapterRepo();
    shared = root;
    process.once("exit", () => rmSync(root, { recursive: true, force: true }));
  }
  return loadProfile({ repoRoot: shared, profile: TEST_CHAPTER });
}
