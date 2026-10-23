import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { z } from "zod";
import { flagValue } from "../argv.ts";
import { ASSET_CONTRACT, describeSpec } from "../assets.ts";
import {
  BrandConfigError,
  DEFAULT_PROFILE,
  REPO_ROOT,
  issuesToBrandError,
  loadProfile,
  parseJsonText,
  readJsonFile,
} from "../load-profile.ts";
import { PULLED_ASSETS_DIR } from "../release.ts";
import { SLUG_MESSAGE, SLUG_PATTERN, brandSchema } from "../schema.ts";
import { SITE_CONTENT_FILE } from "../site-content.ts";
import { CommandError, runCommand, type CommandRunner } from "./gcloud.ts";
import { exitOnFailure } from "./main.ts";
import { terminalPrompter, type Prompter } from "./prompts.ts";

type Answers = Record<string, unknown>;

const isRecord = (value: unknown): value is Answers =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function get(answers: Answers, path: string): unknown {
  let node: unknown = answers;
  for (const key of path.split(".")) {
    if (!isRecord(node)) return undefined;
    node = node[key];
  }
  return node;
}

function set(answers: Answers, path: string, value: unknown): void {
  const keys = path.split(".");
  const last = keys.pop() ?? path;
  let node = answers;
  for (const key of keys) {
    const child = node[key];
    const next: Answers = isRecord(child) ? child : {};
    node[key] = next;
    node = next;
  }
  node[last] = value;
}

const text = (answers: Answers, path: string) => {
  const value = get(answers, path);
  return typeof value === "string" && value.trim() ? value : undefined;
};

interface Field {
  path: string;
  label: string;
  fallback?: (answers: Answers, example: Answers) => string | undefined;
  /** `int` parses a number; `optional` omits a blank reply; `blank` keeps "" (feature off). */
  kind?: "int" | "optional" | "blank";
  /** Re-asked at once while this returns a reason (interactive only; a file is checked whole). */
  check?: (reply: string, repoRoot: string) => string | undefined;
}

const from = (path: string) => (answers: Answers) => text(answers, path);
const fromExample = (path: string) => (_: Answers, example: Answers) => text(example, path);
const fromProject = (suffix: string) => (answers: Answers) => {
  const projectId = text(answers, "firebase.projectId");
  return projectId && `${projectId}${suffix}`;
};

/** In brand.json order; a fallback may read any field asked before it. */
const PROFILE_FIELDS: readonly Field[] = [
  {
    path: "slug",
    label: "Profile slug, lowercase kebab-case (e.g. jci-valle)",
    check: (reply, repoRoot) =>
      !SLUG_PATTERN.test(reply)
        ? `"${reply}" ${SLUG_MESSAGE}`
        : existsSync(join(repoRoot, "brand", reply))
          ? `brand/${reply} already exists; pick another slug`
          : undefined,
  },
  { path: "name", label: "Chapter name" },
  { path: "shortName", label: "Short name", fallback: from("name") },
  { path: "legalName", label: "Legal name", fallback: from("name") },
  { path: "movementName", label: "Movement name", fallback: fromExample("movementName") },
  { path: "description", label: "One-line description", fallback: from("name") },
  { path: "locality.city", label: "City" },
  { path: "locality.cityFormal", label: "City, formal name", fallback: from("locality.city") },
  { path: "locality.region", label: "Region, as used in a sentence (e.g. el Oriente boliviano)" },
  {
    path: "locality.regionShort",
    label: "Short region (blank: same as region)",
    kind: "optional",
  },
  { path: "locality.country", label: "Country" },
  { path: "foundedYear", label: "Year founded", kind: "int" },
  {
    path: "stats.nationalOrganizations",
    label: "Local organizations in the national federation",
    kind: "int",
  },
  { path: "parentOrganization.name", label: "National federation name" },
  { path: "parentOrganization.url", label: "National federation URL (https)" },
  { path: "broadcastChannelName", label: "WhatsApp broadcast channel name" },
  { path: "locale", label: "Language tag", fallback: fromExample("locale") },
  { path: "ogLocale", label: "Open Graph locale", fallback: fromExample("ogLocale") },
  { path: "urls.spotlight", label: "Public site origin (https://…)" },
  { path: "urls.backstage", label: "Admin site origin (https://…)" },
  {
    path: "qrPrefix",
    label: "QR credential prefix, [a-z0-9-]",
    fallback: (answers) => text(answers, "slug")?.replaceAll("-", ""),
  },
  {
    path: "themeColor.spotlight",
    label: "Public site theme colour",
    fallback: fromExample("themeColor.spotlight"),
  },
  {
    path: "themeColor.backstage",
    label: "Admin site theme colour",
    fallback: fromExample("themeColor.backstage"),
  },
  { path: "seo.title", label: "Page title", fallback: from("name") },
  { path: "seo.description", label: "Meta description", fallback: from("description") },
  { path: "seo.ogTitle", label: "Share title", fallback: from("seo.title") },
  { path: "seo.ogDescription", label: "Share description", fallback: from("seo.description") },
  { path: "seo.ogImageAlt", label: "Share image alt text", fallback: from("name") },
  {
    path: "seo.twitterDescription",
    label: "Twitter description",
    fallback: from("seo.description"),
  },
  { path: "backstage.title", label: "Admin portal title", fallback: from("name") },
  { path: "backstage.emailPlaceholder", label: "Sign-in email placeholder" },
  { path: "backstage.contactEmail", label: "Contact email for access requests" },
  { path: "firebase.projectId", label: "Firebase project id" },
  {
    path: "firebase.storageBucket",
    label: "Firebase Storage bucket",
    fallback: fromProject(".firebasestorage.app"),
  },
  { path: "firebase.sites.spotlight", label: "Public hosting site id", fallback: fromProject("") },
  {
    path: "firebase.sites.backstage",
    label: "Admin hosting site id",
    fallback: fromProject("-backstage"),
  },
  { path: "firebase.web.spotlight.appId", label: "Public site web app id (1:…:web:…)" },
  { path: "firebase.web.backstage.appId", label: "Admin site web app id (1:…:web:…)" },
];

/** Asked after the optional sdkconfig read, which can fill them. */
const WEB_KEY_FIELDS: readonly Field[] = [
  {
    path: "firebase.web.authDomain",
    label: "Auth domain",
    fallback: fromProject(".firebaseapp.com"),
  },
  {
    path: "firebase.web.messagingSenderId",
    label: "Messaging sender id",
    // A web app id is 1:<sender id>:web:<hash>.
    fallback: (answers) => text(answers, "firebase.web.spotlight.appId")?.split(":")[1],
  },
  { path: "firebase.web.spotlight.apiKey", label: "Public site API key" },
  { path: "firebase.web.backstage.apiKey", label: "Admin site API key" },
  {
    path: "firebase.web.spotlight.appCheckSiteKey",
    label: "Public site App Check key (blank: off)",
    kind: "blank",
  },
  {
    path: "firebase.web.spotlight.vapidKey",
    label: "Public site web push key (blank: off)",
    kind: "blank",
  },
  {
    path: "firebase.web.backstage.appCheckSiteKey",
    label: "Admin site App Check key (blank: off)",
    kind: "blank",
  },
  {
    path: "firebase.web.backstage.vapidKey",
    label: "Admin site web push key (blank: off)",
    kind: "blank",
  },
  {
    path: "assetsBucket",
    label: "Brand assets bucket (private)",
    fallback: fromProject("-brand-assets"),
  },
];

const sdkconfigSchema = z.object({
  result: z.object({
    sdkConfig: z.object({
      projectId: z.string(),
      apiKey: z.string(),
      authDomain: z.string(),
      messagingSenderId: z.string(),
    }),
  }),
});

function fillIfBlank(answers: Answers, path: string, value: string): void {
  if (!text(answers, path)) set(answers, path, value);
}

/** Reads each web app's config with `firebase apps:sdkconfig` (read-only) and fills the gaps. */
async function fillWebConfig(answers: Answers, run: CommandRunner): Promise<void> {
  const projectId = text(answers, "firebase.projectId");
  if (!projectId)
    throw new BrandConfigError(["firebase.projectId is needed to read the web config"]);
  for (const app of ["spotlight", "backstage"] as const) {
    const appId = text(answers, `firebase.web.${app}.appId`);
    if (!appId)
      throw new BrandConfigError([`firebase.web.${app}.appId is needed to read its config`]);
    const output = await run("firebase", [
      "apps:sdkconfig",
      "WEB",
      appId,
      "--project",
      projectId,
      "--json",
    ]);
    const label = `firebase apps:sdkconfig WEB ${appId}`;
    const parsed = sdkconfigSchema.safeParse(parseJsonText(output, label));
    if (!parsed.success) throw issuesToBrandError(label, parsed.error.issues);
    const config = parsed.data.result.sdkConfig;
    if (config.projectId !== projectId) {
      throw new BrandConfigError([
        `${label}: app belongs to project "${config.projectId}", not "${projectId}"`,
      ]);
    }
    fillIfBlank(answers, `firebase.web.${app}.apiKey`, config.apiKey);
    fillIfBlank(answers, "firebase.web.authDomain", config.authDomain);
    fillIfBlank(answers, "firebase.web.messagingSenderId", config.messagingSenderId);
  }
}

export const ANSWERS_FILE = "brand-init-answers.json";

function checkReply(field: Field, reply: string, repoRoot: string): string | undefined {
  if (field.kind === "int" && !/^\d+$/.test(reply)) return `"${reply}" must be a whole number`;
  return field.check?.(reply, repoRoot);
}

/** Keys in the template's order (brand.json's), then any others. */
function orderLike(template: unknown, value: unknown): unknown {
  if (!isRecord(value)) return value;
  const shape = isRecord(template) ? template : {};
  const keys = [...Object.keys(shape).filter((key) => key in value), ...Object.keys(value)];
  return Object.fromEntries(
    [...new Set(keys)].map((key) => [key, orderLike(shape[key], value[key])]),
  );
}

function assetReadme(): string {
  const rows = ASSET_CONTRACT.map((spec) => `  ${spec.path.padEnd(40)}${describeSpec(spec)}`);
  return [
    "Brand assets for the selected profile (BRAND_PROFILE). Never commit this folder:",
    "it is gitignored, and deployments read the profile's private bucket instead.",
    "",
    `Put these ${ASSET_CONTRACT.length} PNG files here, then run pnpm brand:check:`,
    "",
    ...rows,
    "",
    "The three logos must share one size. Keep og-image.png under 300 KB so WhatsApp shows it.",
    "When the set passes, upload it with pnpm brand:push (see docs/adopting.md).",
    "",
  ].join("\n");
}

/**
 * Creates `brand/<slug>/` from answers (a file, prompts, or both), the example's site
 * content, and `brand-assets/README.txt`. Validates everything before writing anything.
 */
export async function init({
  repoRoot = REPO_ROOT,
  answers: initial,
  prompter,
  fillWeb = false,
  run = runCommand,
}: {
  repoRoot?: string;
  answers: Answers;
  prompter?: Prompter;
  fillWeb?: boolean;
  run?: CommandRunner;
}): Promise<{ slug: string; files: string[] }> {
  const example = loadProfile({ repoRoot, profile: DEFAULT_PROFILE });
  const exampleJson = readJsonFile(join(example.dir, "brand.json"), "example profile");
  const exampleAnswers = isRecord(exampleJson) ? exampleJson : {};
  const answers: Answers = structuredClone(initial);

  const askAll = async (fields: readonly Field[]) => {
    for (const field of fields) {
      if (get(answers, field.path) !== undefined) continue;
      const fallback = field.fallback?.(answers, exampleAnswers);
      let reply: string;
      let error: string | undefined;
      do {
        reply =
          (await prompter?.ask({ key: field.path, label: field.label, fallback, error })) ||
          fallback ||
          "";
        error = prompter && reply !== "" ? checkReply(field, reply, repoRoot) : undefined;
      } while (error);
      if (reply !== "" || field.kind === "blank") {
        const value = field.kind === "int" && /^\d+$/.test(reply) ? Number(reply) : reply;
        set(answers, field.path, value);
      }
    }
  };

  try {
    await askAll(PROFILE_FIELDS);
    const wanted =
      fillWeb ||
      (prompter !== undefined &&
        /^y/i.test(
          await prompter.ask({
            key: "fillWeb",
            label: "Read the API keys with firebase apps:sdkconfig? Needs firebase login (y/N)",
          }),
        ));
    if (wanted) await fillWebConfig(answers, run);
    await askAll(WEB_KEY_FIELDS);
    return writeProfile({ repoRoot, answers, exampleAnswers, exampleDir: example.dir });
  } catch (error) {
    if (!prompter || !(error instanceof BrandConfigError || error instanceof CommandError)) {
      throw error;
    }
    // Typed answers are not lost to a late failure: they become an --answers file.
    const saved = join(repoRoot, ANSWERS_FILE);
    writeFileSync(saved, `${JSON.stringify(answers, null, 2)}\n`);
    const reasons = error instanceof BrandConfigError ? error.errors : [error.message];
    throw new BrandConfigError([
      ...reasons,
      `your answers are in ${saved}; fix them and re-run pnpm brand:init --answers ${saved}`,
    ]);
  }
}

function writeProfile({
  repoRoot,
  answers,
  exampleAnswers,
  exampleDir,
}: {
  repoRoot: string;
  answers: Answers;
  exampleAnswers: Answers;
  exampleDir: string;
}): { slug: string; files: string[] } {
  const slug = String(answers.slug ?? "");
  const brand = orderLike(exampleAnswers, { $schema: "../brand.schema.json", ...answers });
  const label = `brand/${slug || "<slug>"}/brand.json`;
  const parsed = brandSchema.safeParse(brand);
  if (!parsed.success) throw issuesToBrandError(label, parsed.error.issues);

  const dir = join(repoRoot, "brand", slug);
  if (existsSync(dir)) {
    throw new BrandConfigError([`brand/${slug} already exists; pick another slug or edit it`]);
  }
  mkdirSync(dir);
  const files = [`brand/${slug}/brand.json`, `brand/${slug}/${SITE_CONTENT_FILE}`];
  writeFileSync(join(dir, "brand.json"), `${JSON.stringify(brand, null, 2)}\n`);
  copyFileSync(join(exampleDir, SITE_CONTENT_FILE), join(dir, SITE_CONTENT_FILE));

  const assetsDir = join(repoRoot, PULLED_ASSETS_DIR);
  const readme = join(assetsDir, "README.txt");
  if (!existsSync(readme)) {
    mkdirSync(assetsDir, { recursive: true });
    writeFileSync(readme, assetReadme());
    files.push(`${PULLED_ASSETS_DIR}/README.txt`);
  }
  return { slug, files };
}

if (import.meta.main) {
  await exitOnFailure(async () => {
    const argv = process.argv.slice(2);
    const answersFile = flagValue(argv, "--answers", (message) => new BrandConfigError([message]));
    // pnpm runs root scripts from the workspace root; INIT_CWD is where the user typed.
    const cwd = process.env.INIT_CWD ?? process.cwd();
    const answers = answersFile ? readJsonFile(resolve(cwd, answersFile), answersFile) : {};
    if (!isRecord(answers)) throw new BrandConfigError([`${answersFile}: must be a JSON object`]);
    const prompter = answersFile ? undefined : terminalPrompter();
    try {
      const { slug, files } = await init({
        answers,
        prompter,
        fillWeb: argv.includes("--sdkconfig"),
      });
      console.log(`brand:init: created ${files.join(", ")}.`);
      console.log(
        [
          "",
          "Next:",
          `  export BRAND_PROFILE=${slug}`,
          "      add that line to your shell profile or .envrc",
          "  pnpm brand:apply",
          "      writes .firebaserc for the new project",
          `  edit brand/${slug}/${SITE_CONTENT_FILE}`,
          `  put the ${ASSET_CONTRACT.length} files in ${PULLED_ASSETS_DIR}/ (its README.txt lists them), then pnpm brand:check`,
          "  pnpm brand:doctor",
          "",
          `Commit brand/${slug}/ in your fork; never commit ${PULLED_ASSETS_DIR}/. Guide: docs/adopting.md`,
        ].join("\n"),
      );
    } finally {
      prompter?.close();
    }
  });
}
