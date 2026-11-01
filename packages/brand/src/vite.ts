import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadEnv, type Plugin } from "vite";
import { ICON_FILES, LOGO_FILES, assetRemedies, validateAssets } from "./assets.ts";
import { BrandConfigError, REPO_ROOT, loadProfile, type LoadedProfile } from "./load-profile.ts";
import type { PngSize } from "./png.ts";
import type { BrandApp } from "./ports.ts";
import {
  RELEASE_MARKER_FILE,
  isRelease,
  releaseErrors,
  displayDir,
  releaseIdentity,
  type ReleaseIdentity,
  type ReleaseMarker,
} from "./release.ts";
import { renderHtml } from "./render-html.ts";
import type { Brand } from "./schema.ts";
import type { SiteContent } from "./site-content.ts";
import { stagePublic } from "./stage-public.ts";
import { resolveUrls, type BrandUrls } from "./urls.ts";
import { sha256 } from "./hash.ts";

export const BRAND_VIRTUAL_MODULE = "virtual:luminova-brand";
const RESOLVED_VIRTUAL_MODULE = `\0${BRAND_VIRTUAL_MODULE}`;
// Its own module so only spotlight's fallback pulls the content into a bundle.
const SITE_CONTENT_VIRTUAL_MODULE = `${BRAND_VIRTUAL_MODULE}/site-content`;
const RESOLVED_SITE_CONTENT_MODULE = `\0${SITE_CONTENT_VIRTUAL_MODULE}`;

export interface BrandBuildOptions {
  app: BrandApp;
  profile?: string;
  repoRoot?: string;
}

export interface BrandPluginOptions extends BrandBuildOptions {
  /** The build the Vite config already resolved; resolved here when absent (vitest). */
  build?: BrandBuild;
}

export interface BrandBuild {
  profile: LoadedProfile;
  urls: BrandUrls;
  emulatorEnabled: boolean;
  assetsDir: string;
  logoSize: PngSize;
  siteContent: SiteContent;
  /** Written to `dist/.brand-release.json`; null outside release mode. */
  release: ReleaseIdentity | null;
}

export interface ResolveBrandBuildOptions extends BrandBuildOptions {
  command: "serve" | "build";
  mode: string;
  envDir: string;
  env?: Readonly<Record<string, string | undefined>>;
}

/**
 * Whether the app talks to the emulators: what an env file or the environment says, else
 * yes for the dev server (a fresh clone must never reach a real project) and no for a build.
 */
export function emulatorSetting(
  command: "serve" | "build",
  env: Readonly<Record<string, string | undefined>>,
): boolean {
  const value = env.VITE_FIREBASE_EMULATOR_ENABLED?.trim();
  return value ? value === "true" : command === "serve";
}

const printedWarnings = new Set<string>();

function warnOnce(message: string) {
  if (printedWarnings.has(message)) return;
  printedWarnings.add(message);
  console.warn(`[luminova-brand] ${message}`);
}

export function resolveBrandBuild({
  profile: profileName,
  repoRoot = REPO_ROOT,
  command,
  mode,
  envDir,
  env = process.env,
}: ResolveBrandBuildOptions): BrandBuild {
  const release = isRelease(env);
  const profile = loadProfile({ repoRoot, env, profile: profileName });
  // In release an override is an error that says the same thing, so the warning would repeat it.
  if (!release) for (const warning of profile.warnings) warnOnce(warning);

  const emulatorEnabled = emulatorSetting(command, loadEnv(mode, envDir, "VITE_"));
  const urls = resolveUrls(profile.brand.urls, { command, emulatorEnabled });

  const { assetsDir } = profile;
  const errors = release ? releaseErrors({ profile, env, repoRoot, command, emulatorEnabled }) : [];
  const validation = validateAssets(assetsDir);
  for (const warning of validation.warnings) warnOnce(warning);
  const prefix = displayDir(repoRoot, assetsDir);
  const problems = [...errors, ...validation.errors.map((error) => `${prefix}/${error}`)];
  const remedies = assetRemedies(validation, prefix, { release });
  if (problems.length > 0) throw new BrandConfigError(problems, remedies);
  if (!validation.logoSize) {
    throw new BrandConfigError([`${prefix}: the three logos could not be read`], remedies);
  }

  return {
    profile,
    urls,
    emulatorEnabled,
    assetsDir,
    logoSize: validation.logoSize,
    siteContent: profile.siteContent,
    release: release ? releaseIdentity(profile, repoRoot) : null,
  };
}

export const PWA_INCLUDE_ASSETS = ICON_FILES.filter(
  ({ name }) => name.startsWith("favicon-") || name.startsWith("apple-touch-icon-"),
).map(({ name }) => name);

export function pwaManifest(brand: Brand, app: BrandApp) {
  const icon = (name: string) => {
    const size = ICON_FILES.find((file) => file.name === name)?.size;
    return { src: name, sizes: `${size}x${size}`, type: "image/png" };
  };
  return {
    name: brand.name,
    short_name: brand.shortName,
    description: brand.description,
    lang: brand.locale,
    theme_color: brand.themeColor[app],
    background_color: brand.themeColor[app],
    display: "standalone" as const,
    start_url: "/",
    scope: "/",
    icons: [
      icon("pwa-192x192.png"),
      icon("pwa-512x512.png"),
      { ...icon("maskable-icon-512x512.png"), purpose: "maskable" },
    ],
  };
}

/** Matches the resolved logos, so `vite-imagetools` applies wherever the assets live. */
export function logoInclude(build: BrandBuild): RegExp {
  const dir = build.assetsDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${dir}/logo-[^/]+\\.png$`);
}

/**
 * The Firebase web config Vite inlines. Against the emulators, App Check and web push stay
 * off unless an env file opts in: the profile's real reCAPTCHA and VAPID keys do not work
 * on localhost.
 */
function firebaseEnv(brand: Brand, app: BrandApp, emulator: boolean): Record<string, string> {
  const { firebase } = brand;
  const web = firebase.web[app];
  const live = emulator
    ? {}
    : {
        VITE_APPCHECK_SITE_KEY: web.appCheckSiteKey,
        // Today's bundles carry no VAPID key; an empty string would change the output.
        ...(web.vapidKey ? { VITE_FIREBASE_VAPID_KEY: web.vapidKey } : {}),
      };
  return {
    VITE_FIREBASE_API_KEY: web.apiKey,
    VITE_FIREBASE_AUTH_DOMAIN: firebase.web.authDomain,
    VITE_FIREBASE_PROJECT_ID: firebase.projectId,
    VITE_FIREBASE_STORAGE_BUCKET: firebase.storageBucket,
    VITE_FIREBASE_MESSAGING_SENDER_ID: firebase.web.messagingSenderId,
    VITE_FIREBASE_APP_ID: web.appId,
    VITE_FIREBASE_EMULATOR_ENABLED: String(emulator),
    ...live,
  };
}

function runtimeBrand({ brand, urls }: { brand: Brand; urls: BrandUrls }) {
  return {
    name: brand.name,
    shortName: brand.shortName,
    legalName: brand.legalName,
    movementName: brand.movementName,
    description: brand.description,
    locality: brand.locality,
    foundedYear: brand.foundedYear,
    stats: brand.stats,
    parentOrganization: brand.parentOrganization,
    broadcastChannelName: brand.broadcastChannelName,
    locale: brand.locale,
    qrPrefix: brand.qrPrefix,
    urls,
    emailPlaceholder: brand.backstage.emailPlaceholder,
    contactEmail: brand.backstage.contactEmail,
  };
}

function virtualModuleSource(build: BrandBuild): string {
  const [main, onDark, onPrimary] = LOGO_FILES.map((file) =>
    JSON.stringify(join(build.assetsDir, file)),
  );
  const { width, height } = build.logoSize;
  // One export per field: the bundler drops the fields no module imports.
  const fields = Object.entries(runtimeBrand({ brand: build.profile.brand, urls: build.urls }));
  return [
    `import main from ${main};`,
    `import onDark from ${onDark};`,
    `import onPrimary from ${onPrimary};`,
    ...fields.map(([key, value]) => `export const ${key} = ${JSON.stringify(value)};`),
    `export const logos = { main, onDark, onPrimary, width: ${width}, height: ${height} };`,
    "",
  ].join("\n");
}

function htmlValues(build: BrandBuild, app: BrandApp, ogImageFile: string): Record<string, string> {
  const { brand } = build.profile;
  const shared = {
    SITE_URL: build.urls[app],
    LANG: brand.locale,
    THEME_COLOR: brand.themeColor[app],
    BRAND_NAME: brand.name,
  };
  if (app === "backstage") return { ...shared, BRAND_TITLE: brand.backstage.title };
  return {
    ...shared,
    BRAND_TITLE: brand.seo.title,
    SEO_DESCRIPTION: brand.seo.description,
    OG_LOCALE: brand.ogLocale,
    OG_TITLE: brand.seo.ogTitle,
    OG_DESCRIPTION: brand.seo.ogDescription,
    OG_IMAGE: ogImageFile,
    OG_IMAGE_ALT: brand.seo.ogImageAlt,
    TWITTER_DESCRIPTION: brand.seo.twitterDescription,
  };
}

export function brandPlugin({
  app,
  profile,
  repoRoot,
  build: resolved,
}: BrandPluginOptions): Plugin {
  let state: { build: BrandBuild; ogImageFile: string } | undefined;

  function current() {
    if (!state) throw new Error("luminova-brand: the config hook has not run");
    return state;
  }

  return {
    name: "luminova-brand",
    enforce: "pre",
    config(config, { command, mode }) {
      const root = resolve(config.root ?? process.cwd());
      const envDir = config.envDir ? resolve(root, config.envDir) : root;
      const build =
        resolved ?? resolveBrandBuild({ app, profile, repoRoot, command, mode, envDir });
      // Tests only need the virtual module; staging would rewrite the public dir per run.
      if (mode === "test") {
        state = { build, ogImageFile: "" };
        return;
      }
      const publicDir = join(root, "node_modules", ".cache", "luminova-brand", app, "public");
      const { ogImageFile } = stagePublic({
        appPublicDir: join(root, "public"),
        assetsDir: build.assetsDir,
        app,
        brand: build.profile.brand,
        outDir: publicDir,
      });
      // Every mode reads the profile's Firebase config, so dev, the emulators (.firebaserc)
      // and the seeds name one project. Vite loads env files after this hook, and process
      // env wins over them, so a stale apps/*/.env.local cannot point dev elsewhere.
      // It stays for the life of the process, so changing the emulator flag in .env.local
      // takes a dev-server restart (the .env.local example says so).
      Object.assign(process.env, firebaseEnv(build.profile.brand, app, build.emulatorEnabled));
      state = { build, ogImageFile };
      return { publicDir };
    },
    resolveId(id) {
      if (id === BRAND_VIRTUAL_MODULE) return RESOLVED_VIRTUAL_MODULE;
      if (id === SITE_CONTENT_VIRTUAL_MODULE) return RESOLVED_SITE_CONTENT_MODULE;
      return null;
    },
    load(id) {
      if (id === RESOLVED_VIRTUAL_MODULE) return virtualModuleSource(current().build);
      if (id === RESOLVED_SITE_CONTENT_MODULE) {
        return `export const siteContent = ${JSON.stringify(current().build.siteContent)};\n`;
      }
      return null;
    },
    // After every other plugin's writeBundle, so index.html is final on disk.
    writeBundle: {
      order: "post",
      handler(options, bundle) {
        const { release } = current().build;
        if (!release) return;
        const html = bundle["index.html"];
        if (html?.type !== "asset" || !options.dir) {
          throw new BrandConfigError(["release build emitted no index.html to mark"]);
        }
        const marker: ReleaseMarker = { ...release, indexHtml: sha256(html.source) };
        // A dotfile, so the hosting `ignore` (`**/.*`) keeps it off the CDN.
        writeFileSync(
          join(options.dir, RELEASE_MARKER_FILE),
          `${JSON.stringify(marker, null, 2)}\n`,
        );
      },
    },
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        const { build, ogImageFile } = current();
        return renderHtml(html, htmlValues(build, app, ogImageFile));
      },
    },
  };
}
