import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { build } from "vite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writeAssetSet } from "./asset-set.ts";
import { OG_IMAGE_FILE } from "./assets.ts";
import { BrandConfigError, EXAMPLE_PROFILE, REPO_ROOT, loadProfile } from "./load-profile.ts";
import { TEST_CHAPTER, errorsOf, exampleRepo, recordLocal, writeChapter } from "./test-profiles.ts";
import { DEV_PORTS, PREVIEW_PORTS } from "./ports.ts";
import { sha256 } from "./hash.ts";
import { RELEASE_MARKER_FILE, readReleaseMarker } from "./release.ts";
import {
  brandPlugin,
  emulatorSetting,
  logoInclude,
  pwaManifest,
  resolveBrandBuild,
} from "./vite.ts";

const ENV_KEYS = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_FIREBASE_APP_ID",
  "VITE_FIREBASE_VAPID_KEY",
  "VITE_APPCHECK_SITE_KEY",
  "VITE_FIREBASE_EMULATOR_ENABLED",
] as const;

let repoRoot: string;
let envDir: string;
let savedEnv: Record<string, string | undefined>;

// Distinct colours keep Vite from deduplicating identical logo bytes into one asset.
const distinctColors = (_: unknown, index: number) => [index, 0x66, 0x99] as const;

function resolve(overrides: Partial<Parameters<typeof resolveBrandBuild>[0]> = {}) {
  return resolveBrandBuild({
    app: "spotlight",
    profile: EXAMPLE_PROFILE,
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
  repoRoot = exampleRepo("brand-vite-", { assets: false });
  envDir = join(repoRoot, "env");
  mkdirSync(envDir);
  writeChapter(repoRoot, { assets: false });
  for (const slug of [EXAMPLE_PROFILE, TEST_CHAPTER]) {
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
    const env = { BRAND_PROFILE: EXAMPLE_PROFILE };
    resolve({ profile: undefined, env });
    resolve({ profile: undefined, env });
    const overrideWarnings = warn.mock.calls.filter(([message]) =>
      String(message).includes("overrides the profile found in brand/"),
    );
    expect(overrideWarnings).toHaveLength(1);
  });

  it("uses the profile's committed assets when nothing else is present", () => {
    const result = resolve();
    expect(result.assetsDir).toBe(join(repoRoot, "brand", EXAMPLE_PROFILE, "assets"));
    expect(result.profile.slug).toBe(EXAMPLE_PROFILE);
    expect(result.logoSize).toEqual({ width: 400, height: 200 });
  });

  it("reads brand/local/ for the local profile, and names it in the errors", () => {
    writeChapter(repoRoot, { slug: "local" });
    const result = resolve({ profile: undefined });
    expect(result.profile.slug).toBe("local");
    expect(result.assetsDir).toBe(join(repoRoot, "brand", "local"));
    rmSync(join(repoRoot, "brand", "local", OG_IMAGE_FILE));
    expect(() => resolve({ profile: undefined })).toThrow(/brand\/local\/og-image\.png: missing/);
  });

  it("reads a committed chapter's own assets/ while brand/local/ holds no pulled images", () => {
    expect(resolve({ profile: undefined }).assetsDir).toBe(
      join(repoRoot, "brand", TEST_CHAPTER, "assets"),
    );
  });

  it("tells the developer what to do, in the error Vite prints", () => {
    rmSync(join(repoRoot, "brand", EXAMPLE_PROFILE, "assets", OG_IMAGE_FILE));
    expect(() => resolve()).toThrow(
      /To fix:\n {2}- put the files marked above in brand\/example\/assets\/[\s\S]*pnpm brand:check {3}# in the repo root/,
    );
  });

  it("lists every asset problem at once, prefixed with the asset dir", () => {
    const assets = join(repoRoot, "brand", EXAMPLE_PROFILE, "assets");
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
      expect.stringMatching(/^brand\/example\/assets\/og-image\.png: missing/),
      expect.stringMatching(/^brand\/example\/assets\/backstage\/favicon-16\.png: missing/),
    ]);
  });

  it("validates the site texts of brand.toml and lists every problem", () => {
    editExample(["programCount = 3", 'programCount = "3"'], ['valores = "', 'valoress = "']);
    let caught: unknown;
    try {
      resolve();
    } catch (error) {
      caught = error;
    }
    expect(caught instanceof BrandConfigError ? caught.errors : []).toEqual([
      expect.stringMatching(/^brand\/example\/brand\.toml \[stats\] programCount: /),
      "brand/example/brand.toml [mvv] valores: required",
      "brand/example/brand.toml [mvv] valoress: unknown key (a typo?)",
    ]);
  });

  it("carries the parsed site content", () => {
    expect(resolve().siteContent.stats.standoutOrg.title).toBe("Organización Local Destacada");
  });

  it("connects the dev server to the emulators unless an env file says otherwise", () => {
    expect(resolve({ command: "serve", mode: "development" }).emulatorEnabled).toBe(true);
    writeFileSync(join(envDir, ".env.local"), "VITE_FIREBASE_EMULATOR_ENABLED=false\n");
    expect(resolve({ command: "serve", mode: "development" }).emulatorEnabled).toBe(false);
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
      spotlight: "https://demo-example.web.app",
      backstage: "https://demo-example-backstage.web.app",
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

const RELEASE_ENV = { BRAND_RELEASE: "1", GCP_PROJECT_ID: "jci-valle" };

/** What CD's brand:pull leaves today: the bucket's images in brand/local/, no brand.toml. */
function writePulledAssets(project = "jci-valle") {
  writeAssetSet(join(repoRoot, "brand", "local"), distinctColors);
  recordLocal(repoRoot, { project });
}

describe("resolveBrandBuild in release mode", () => {
  it("reads the committed chapter's pulled images in brand/local/ and carries the marker", () => {
    writePulledAssets();
    const result = resolve({ profile: undefined, env: RELEASE_ENV });
    expect(result.assetsDir).toBe(join(repoRoot, "brand", "local"));
    expect(result.release).toEqual({
      profile: "jci-valle",
      projectId: "jci-valle",
      assets: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
  });

  it("never ships the profile's committed assets", () => {
    expect(errorsOf(() => resolve({ profile: undefined, env: RELEASE_ENV }))).toEqual([
      "no .pull-manifest.json in brand/local/: a deploy only uses files downloaded with brand:pull.",
    ]);
  });

  it("releases the local profile from brand/local/, brand.toml included", () => {
    writeChapter(repoRoot, { slug: "local" });
    recordLocal(repoRoot);
    const result = resolve({ profile: undefined, env: RELEASE_ENV });
    expect(result.release).toMatchObject({ profile: "local", projectId: "jci-valle" });
    writeFileSync(join(repoRoot, "brand", "local", "brand.toml"), "# edited\n", { flag: "a" });
    expect(errorsOf(() => resolve({ profile: undefined, env: RELEASE_ENV }))).toEqual([
      "brand/local/brand.toml: changed after brand:pull; upload it with brand:push, or pull again",
    ]);
  });

  it("fails a release of the example, naming it", () => {
    writePulledAssets("demo-example");
    const errors = errorsOf(() =>
      resolve({ profile: EXAMPLE_PROFILE, env: { BRAND_RELEASE: "1" } }),
    );
    expect(errors).toContainEqual(expect.stringMatching(/"example" is the example/));
  });

  it("fails on a project mismatch and still lists the asset problems", () => {
    const errors = errorsOf(() =>
      resolve({ profile: undefined, env: { ...RELEASE_ENV, GCP_PROJECT_ID: "someone-else" } }),
    );
    expect(errors).toContainEqual(expect.stringMatching(/^GCP_PROJECT_ID "someone-else"/));
    expect(errors).toContainEqual(expect.stringMatching(/^no \.pull-manifest\.json/));
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
    const { brand } = loadProfile({ repoRoot: REPO_ROOT, profile: EXAMPLE_PROFILE });
    expect(pwaManifest(brand, "backstage")).toEqual({
      name: "JCI Ejemplo",
      short_name: "JCI Ejemplo",
      description: "Junior Chamber International Ciudad Ejemplo",
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
    const build = { ...resolve(), assetsDir: join(repoRoot, "custom (assets)") };
    const include = logoInclude(build);
    expect(include.test(join(build.assetsDir, "logo-main.png"))).toBe(true);
    expect(include.test(join(build.assetsDir, "og-image.png"))).toBe(false);
    expect(include.test(join(repoRoot, "brand/example/assets/logo-main.png"))).toBe(false);
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

const APP_CHECK_KEY = "example-recaptcha-site-key";

/** The example with a real-looking App Check key, as a live chapter has. */
/** Edits the example's brand.toml in the test repo, one exact text replacement at a time. */
function editExample(...replacements: [string, string][]) {
  const file = join(repoRoot, "brand", EXAMPLE_PROFILE, "brand.toml");
  let toml = readFileSync(file, "utf8");
  for (const [from, to] of replacements) {
    if (!toml.includes(from)) throw new Error(`the example's brand.toml has no ${from}`);
    toml = toml.replace(from, to);
  }
  writeFileSync(file, toml);
}

function giveExampleAppCheck() {
  editExample(
    ['appCheckSiteKey = "" # blank: App Check off', `appCheckSiteKey = "${APP_CHECK_KEY}"`],
    ["legacyPaths = []", 'legacyPaths = ["og-image-legacy.png"]'],
  );
}

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
console.log(import.meta.env.VITE_FIREBASE_PROJECT_ID, import.meta.env.VITE_APPCHECK_SITE_KEY);
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

describe("emulatorSetting", () => {
  it.each([
    ["serve", undefined, true],
    ["serve", "", true],
    ["serve", "false", false],
    ["build", undefined, false],
    ["build", "true", true],
    ["build", " false ", false],
  ] as const)("%s with %j connects to the emulators: %s", (command, value, expected) => {
    expect(emulatorSetting(command, { VITE_FIREBASE_EMULATOR_ENABLED: value })).toBe(expected);
  });
});

describe("brandPlugin", () => {
  it("builds a real Vite app with the brand applied", { timeout: 60_000 }, async () => {
    giveExampleAppCheck();
    const root = writeApp();
    const dist = await buildApp(
      root,
      brandPlugin({ app: "spotlight", repoRoot, profile: EXAMPLE_PROFILE }),
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
    expect(js).toContain("demo-example");
    expect(js).toContain(APP_CHECK_KEY);
    expect(js).toContain("JCI Ejemplo");
    expect(js).toContain("https://demo-example.web.app");
    expect(js).toContain("Jóvenes que lideran con propósito en Ciudad Ejemplo.");
    // legalName is exported but unused here, so tree-shaking must drop it.
    expect(js).not.toContain("Cámara Junior Internacional Ejemplo");
    for (const logo of ["logo-main", "logo-on-dark", "logo-on-primary"]) {
      expect(assets).toContainEqual(expect.stringMatching(new RegExp(`^${logo}-.*\\.png$`)));
    }
  });

  it(
    "bakes the profile's project into an emulator build, whatever a stale .env.local names",
    { timeout: 60_000 },
    async () => {
      giveExampleAppCheck();
      const root = writeApp();
      writeFileSync(
        join(root, ".env.local"),
        "VITE_FIREBASE_EMULATOR_ENABLED=true\nVITE_FIREBASE_PROJECT_ID=someone-else\n",
      );
      const dist = await buildApp(
        root,
        brandPlugin({ app: "spotlight", repoRoot, profile: EXAMPLE_PROFILE }),
      );
      const js = readdirSync(join(dist, "assets"))
        .filter((file) => file.endsWith(".js"))
        .map((file) => readFileSync(join(dist, "assets", file), "utf8"))
        .join("\n");
      expect(js).toContain("demo-example");
      expect(js).not.toContain("someone-else");
      // The profile's real App Check key would fail on localhost against the emulators.
      expect(js).not.toContain(APP_CHECK_KEY);
    },
  );

  it("writes the release marker into a release build's dist", { timeout: 60_000 }, async () => {
    writePulledAssets();
    const resolved = resolve({ profile: undefined, env: RELEASE_ENV });
    const dist = await buildApp(writeApp(), brandPlugin({ app: "spotlight", build: resolved }));
    expect(readReleaseMarker(dist)).toEqual({
      ...resolved.release,
      indexHtml: sha256(readFileSync(join(dist, "index.html"))),
    });
  });
});
