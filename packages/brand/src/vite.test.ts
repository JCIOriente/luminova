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
import { dirname, join } from "node:path";
import { build } from "vite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ASSET_CONTRACT, OG_IMAGE_FILE } from "./assets.ts";
import { BrandConfigError, REPO_ROOT, loadProfile } from "./load-profile.ts";
import { encodePng } from "./png.ts";
import { DEV_PORTS, PREVIEW_PORTS } from "./ports.ts";
import { brandPlugin, pwaManifestFields, resolveBrandBuild } from "./vite.ts";

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

function writeAssetSet(dir: string) {
  ASSET_CONTRACT.forEach((spec, index) => {
    const file = join(dir, spec.path);
    mkdirSync(dirname(file), { recursive: true });
    // Distinct colours keep Vite from deduplicating identical logo bytes into one asset.
    writeFileSync(file, encodePng(spec.width ?? 400, spec.height ?? 200, [index, 0x66, 0x99]));
  });
}

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
    cpSync(
      join(REPO_ROOT, "brand", slug, "brand.json"),
      join(repoRoot, "brand", slug, "brand.json"),
    );
    writeAssetSet(join(repoRoot, "brand", slug, "assets"));
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

describe("pwaManifestFields", () => {
  it("maps the profile to the app's manifest fields", () => {
    const { brand } = loadProfile({ repoRoot: REPO_ROOT, profile: "fixture" });
    expect(pwaManifestFields(brand, "backstage")).toEqual({
      name: "Fixture Chapter",
      short_name: "Fixture",
      description: "Fixture Chapter, a neutral test profile",
      lang: "es",
      theme_color: "#222222",
      background_color: "#222222",
    });
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

describe("brandPlugin", () => {
  it("builds a real Vite app with the brand applied", { timeout: 60_000 }, async () => {
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
      `import { brand, logos } from "virtual:luminova-brand";
console.log(brand.name, brand.urls.spotlight, logos.main, logos.onDark, logos.onPrimary, logos.width);
console.log(import.meta.env.VITE_FIREBASE_PROJECT_ID);
`,
    );

    await build({
      root,
      configFile: false,
      logLevel: "silent",
      build: { assetsInlineLimit: 0 },
      plugins: [brandPlugin({ app: "spotlight", repoRoot, profile: "fixture" })],
    });

    const dist = join(root, "dist");
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
    for (const logo of ["logo-main", "logo-on-dark", "logo-on-primary"]) {
      expect(assets).toContainEqual(expect.stringMatching(new RegExp(`^${logo}-.*\\.png$`)));
    }
  });
});
