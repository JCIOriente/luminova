import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "vite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writeAssetSet } from "./asset-set.ts";
import { OG_IMAGE_FILE } from "./assets.ts";
import { BrandConfigError, REPO_ROOT, loadProfile } from "./load-profile.ts";
import { DEV_PORTS, PREVIEW_PORTS } from "./ports.ts";
import { RELEASE_MARKER_FILE, readReleaseMarker } from "./release.ts";
import { brandPlugin, logoInclude, pwaManifest, resolveBrandBuild } from "./vite.ts";

const ENV_KEYS = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_FIREBASE_APP_ID",
  "VITE_FIREBASE_VAPID_KEY",
  "VITE_APPCHECK_SITE_KEY",
] as const;

let repoRoot: string;
let envDir: string;
let savedEnv: Record<string, string | undefined>;

// Distinct colours keep Vite from deduplicating identical logo bytes into one asset.
const distinctColors = (_: unknown, index: number) => [index, 0x66, 0x99] as const;

function resolve(overrides: Partial<Parameters<typeof resolveBrandBuild>[0]> = {}) {
  return resolveBrandBuild({
    app: "spotlight",
    profile: "fixture",
    repoRoot,
    command: "build",
    mode: "production",
    envDir,
    env: {},
    ...overrides,
  });
}

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  repoRoot = mkdtempSync(join(tmpdir(), "brand-vite-"));
  envDir = join(repoRoot, "env");
  mkdirSync(envDir);
  for (const slug of ["fixture", "jci-oriente"]) {
    mkdirSync(join(repoRoot, "brand", slug), { recursive: true });
    for (const file of ["brand.json", "site-content.json"]) {
      cpSync(join(REPO_ROOT, "brand", slug, file), join(repoRoot, "brand", slug, file));
    }
    writeAssetSet(join(repoRoot, "brand", slug, "assets"), distinctColors);
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  vi.restoreAllMocks();
  rmSync(repoRoot, { recursive: true, force: true });
});

describe("resolveBrandBuild", () => {
  it("prints each profile warning once per process", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    resolve({ profile: undefined });
    resolve({ profile: undefined });
    const unsetWarnings = warn.mock.calls.filter(([message]) =>
      String(message).includes("BRAND_PROFILE is unset"),
    );
    expect(unsetWarnings).toHaveLength(1);
  });

  it("uses the profile's committed assets when nothing else is present", () => {
    const result = resolve();
    expect(result.assetsDir).toBe(join(repoRoot, "brand", "fixture", "assets"));
    expect(result.profile.slug).toBe("fixture");
    expect(result.logoSize).toEqual({ width: 400, height: 200 });
  });

  it("prefers brand-assets/ over the profile's assets", () => {
    writeAssetSet(join(repoRoot, "brand-assets"));
    expect(resolve().assetsDir).toBe(join(repoRoot, "brand-assets"));
  });

  it("prefers BRAND_ASSETS_DIR, resolved against the repo root, over everything", () => {
    writeAssetSet(join(repoRoot, "brand-assets"));
    writeAssetSet(join(repoRoot, "elsewhere"));
    expect(resolve({ env: { BRAND_ASSETS_DIR: "elsewhere" } }).assetsDir).toBe(
      join(repoRoot, "elsewhere"),
    );
  });

  it("lists every asset problem at once, prefixed with the asset dir", () => {
    const assets = join(repoRoot, "brand", "fixture", "assets");
    rmSync(join(assets, OG_IMAGE_FILE));
    rmSync(join(assets, "backstage", "favicon-16.png"));
    let caught: unknown;
    try {
      resolve();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(BrandConfigError);
    expect(caught instanceof BrandConfigError ? caught.errors : []).toEqual([
      expect.stringMatching(/^brand\/fixture\/assets\/og-image\.png: missing/),
      expect.stringMatching(/^brand\/fixture\/assets\/backstage\/favicon-16\.png: missing/),
    ]);
  });

  it("validates site-content.json and lists every problem", () => {
    const file = join(repoRoot, "brand", "fixture", "site-content.json");
    const content = JSON.parse(readFileSync(file, "utf8"));
    writeFileSync(file, JSON.stringify({ ...content, stats: undefined, mvv: { mision: 1 } }));
    let caught: unknown;
    try {
      resolve();
    } catch (error) {
      caught = error;
    }
    expect(caught instanceof BrandConfigError ? caught.errors : []).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^brand\/fixture\/site-content\.json stats:/),
        expect.stringMatching(/^brand\/fixture\/site-content\.json mvv\.mision:/),
      ]),
    );
  });

  it("carries the parsed site content", () => {
    expect(resolve().siteContent.stats.standoutOrg.title).toBe("Fixture Standout Award");
  });

  it("resolves dev-server urls for serve", () => {
    expect(resolve({ command: "serve", mode: "development" }).urls).toEqual({
      spotlight: `http://localhost:${DEV_PORTS.spotlight}`,
      backstage: `http://localhost:${DEV_PORTS.backstage}`,
    });
  });

  it("resolves production origins for a build without the emulator flag", () => {
    writeFileSync(join(envDir, ".env.production"), "VITE_FIREBASE_EMULATOR_ENABLED=false\n");
    const result = resolve();
    expect(result.emulatorEnabled).toBe(false);
    expect(result.urls).toEqual({
      spotlight: "https://fixture.example.org",
      backstage: "https://admin.fixture.example.org",
    });
  });

  it("builds no release marker outside release mode", () => {
    expect(resolve().release).toBeNull();
  });

  it("reads the emulator flag from the env files and resolves preview urls", () => {
    writeFileSync(join(envDir, ".env.local"), "VITE_FIREBASE_EMULATOR_ENABLED=true\n");
    const result = resolve();
    expect(result.emulatorEnabled).toBe(true);
    expect(result.urls).toEqual({
      spotlight: `http://localhost:${PREVIEW_PORTS.spotlight}`,
      backstage: `http://localhost:${PREVIEW_PORTS.backstage}`,
    });
  });
});

const RELEASE_ENV = {
  BRAND_RELEASE: "1",
  BRAND_PROFILE: "jci-oriente",
  GCP_PROJECT_ID: "jci-oriente",
};

function writePulledAssets(profile = "jci-oriente") {
  const dir = join(repoRoot, "brand-assets");
  writeAssetSet(dir, distinctColors);
  writeFileSync(join(dir, "pull-manifest.json"), JSON.stringify({ profile, objects: [] }));
}

function errorsOf(run: () => unknown): string[] {
  try {
    run();
  } catch (error) {
    if (error instanceof BrandConfigError) return error.errors;
    throw error;
  }
  throw new Error("expected a BrandConfigError");
}

describe("resolveBrandBuild in release mode", () => {
  it("reads brand-assets/ and carries the marker for the selected profile", () => {
    writePulledAssets();
    const result = resolve({ profile: undefined, env: RELEASE_ENV });
    expect(result.assetsDir).toBe(join(repoRoot, "brand-assets"));
    expect(result.release).toEqual({
      profile: "jci-oriente",
      projectId: "jci-oriente",
      assets: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
  });

  it("never falls back to the profile's committed assets", () => {
    const errors = errorsOf(() => resolve({ profile: undefined, env: RELEASE_ENV }));
    expect(errors).toContainEqual(expect.stringMatching(/^brand-assets\/pull-manifest\.json/));
    expect(errors).toContainEqual(expect.stringMatching(/^brand-assets\/logo-main\.png: missing/));
  });

  it("fails a fixture release, naming fixture", () => {
    writePulledAssets("fixture");
    const errors = errorsOf(() =>
      resolve({ profile: undefined, env: { BRAND_RELEASE: "1", BRAND_PROFILE: "fixture" } }),
    );
    expect(errors).toContainEqual(expect.stringMatching(/"fixture" is the neutral test profile/));
  });

  it("fails on a project mismatch and still lists the asset problems", () => {
    const errors = errorsOf(() =>
      resolve({ profile: undefined, env: { ...RELEASE_ENV, GCP_PROJECT_ID: "someone-else" } }),
    );
    expect(errors).toContainEqual(expect.stringMatching(/^GCP_PROJECT_ID "someone-else"/));
    expect(errors).toContainEqual(expect.stringMatching(/logo-main\.png: missing/));
  });

  it("refuses an emulator build", () => {
    writePulledAssets();
    writeFileSync(join(envDir, ".env.local"), "VITE_FIREBASE_EMULATOR_ENABLED=true\n");
    expect(errorsOf(() => resolve({ profile: undefined, env: RELEASE_ENV }))).toEqual([
      expect.stringMatching(/release mode needs a production `vite build`/),
    ]);
  });
});

describe("pwaManifest", () => {
  it("maps the profile to the app's manifest, icons included", () => {
    const { brand } = loadProfile({ repoRoot: REPO_ROOT, profile: "fixture" });
    expect(pwaManifest(brand, "backstage")).toEqual({
      name: "Fixture Chapter",
      short_name: "Fixture",
      description: "Fixture Chapter, a neutral test profile",
      lang: "es",
      theme_color: "#222222",
      background_color: "#222222",
      display: "standalone",
      start_url: "/",
      scope: "/",
      icons: [
        { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
        { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
        {
          src: "maskable-icon-512x512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        },
      ],
    });
  });
});

describe("logoInclude", () => {
  it("matches the resolved logos and nothing else", () => {
    writeAssetSet(join(repoRoot, "custom (assets)"));
    const build = resolve({ env: { BRAND_ASSETS_DIR: "custom (assets)" } });
    const include = logoInclude(build);
    expect(include.test(join(build.assetsDir, "logo-main.png"))).toBe(true);
    expect(include.test(join(build.assetsDir, "og-image.png"))).toBe(false);
    expect(include.test(join(repoRoot, "brand/fixture/assets/logo-main.png"))).toBe(false);
  });
});

describe("brandPlugin config hook", () => {
  it("leaves ports to the app config (so --port wins) and skips staging under vitest", () => {
    const plugin = brandPlugin({ app: "backstage", build: resolve({ app: "backstage" }) });
    const config = typeof plugin.config === "function" ? plugin.config : plugin.config?.handler;
    const result = config?.call(
      // The hook reads no plugin context.
      {} as never,
      { root: join(repoRoot, "app") },
      { command: "serve", mode: "test" },
    );
    expect(result).toBeUndefined();
    expect(existsSync(join(repoRoot, "app", "node_modules"))).toBe(false);
  });
});

const SPOTLIGHT_PLACEHOLDERS = [
  "SITE_URL",
  "LANG",
  "THEME_COLOR",
  "BRAND_NAME",
  "BRAND_TITLE",
  "SEO_DESCRIPTION",
  "OG_LOCALE",
  "OG_TITLE",
  "OG_DESCRIPTION",
  "OG_IMAGE",
  "OG_IMAGE_ALT",
  "TWITTER_DESCRIPTION",
];

function writeApp(): string {
  const root = join(repoRoot, "app");
  mkdirSync(join(root, "src"), { recursive: true });
  mkdirSync(join(root, "public"));
  writeFileSync(join(root, "public", "robots.txt"), "User-agent: *\n");
  writeFileSync(
    join(root, "index.html"),
    `<!doctype html><html lang="__LANG__"><head><title>__BRAND_TITLE__</title>
${SPOTLIGHT_PLACEHOLDERS.map((key) => `<meta name="${key}" content="__${key}__">`).join("\n")}
<script type="module" src="/src/main.js"></script></head><body></body></html>`,
  );
  writeFileSync(
    join(root, "src", "main.js"),
    `import { name, urls, logos } from "virtual:luminova-brand";
import { siteContent } from "virtual:luminova-brand/site-content";
console.log(name, urls.spotlight, logos.main, logos.onDark, logos.onPrimary, logos.width);
console.log(siteContent.hero.motto);
console.log(import.meta.env.VITE_FIREBASE_PROJECT_ID);
`,
  );
  return root;
}

async function buildApp(root: string, plugin: ReturnType<typeof brandPlugin>) {
  await build({
    root,
    configFile: false,
    logLevel: "silent",
    build: { assetsInlineLimit: 0 },
    plugins: [plugin],
  });
  return join(root, "dist");
}

describe("brandPlugin", () => {
  it("builds a real Vite app with the brand applied", { timeout: 60_000 }, async () => {
    const root = writeApp();
    const dist = await buildApp(
      root,
      brandPlugin({ app: "spotlight", repoRoot, profile: "fixture" }),
    );
    expect(existsSync(join(dist, RELEASE_MARKER_FILE))).toBe(false);
    const html = readFileSync(join(dist, "index.html"), "utf8");
    expect(html).not.toMatch(/__[A-Z][A-Z0-9_]*__/);
    expect(html).toContain('<html lang="es">');
    const ogImageFile = /og-image\.[0-9a-f]{8}\.png/.exec(html)?.[0];
    expect(ogImageFile).toBeDefined();
    expect(existsSync(join(dist, ogImageFile ?? ""))).toBe(true);
    expect(existsSync(join(dist, "og-image-legacy.png"))).toBe(true);
    expect(existsSync(join(dist, "robots.txt"))).toBe(true);
    expect(existsSync(join(dist, "favicon-32.png"))).toBe(true);

    const assets = readdirSync(join(dist, "assets"));
    const js = assets
      .filter((file) => file.endsWith(".js"))
      .map((file) => readFileSync(join(dist, "assets", file), "utf8"))
      .join("\n");
    expect(js).toContain("demo-fixture");
    expect(js).toContain("Fixture Chapter");
    expect(js).toContain("https://fixture.example.org");
    expect(js).toContain("Fixture motto for tests.");
    // legalName is exported but unused here, so tree-shaking must drop it.
    expect(js).not.toContain("Fixture Chapter Association");
    for (const logo of ["logo-main", "logo-on-dark", "logo-on-primary"]) {
      expect(assets).toContainEqual(expect.stringMatching(new RegExp(`^${logo}-.*\\.png$`)));
    }
  });

  it("writes the release marker into a release build's dist", { timeout: 60_000 }, async () => {
    writePulledAssets();
    const resolved = resolve({ profile: undefined, env: RELEASE_ENV });
    const dist = await buildApp(writeApp(), brandPlugin({ app: "spotlight", build: resolved }));
    expect(readReleaseMarker(dist)).toEqual(resolved.release);
  });
});
