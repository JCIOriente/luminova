import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { z } from "zod";
import { ASSET_CONTRACT, describeSpec } from "../assets.ts";
import { CONFIG_FILE, configTemplate } from "../config.ts";
import {
  BrandConfigError,
  EXAMPLE_PROFILE,
  REPO_ROOT,
  issuesToBrandError,
  demoProjectId,
  isDemoProject,
  loadProfile,
  parseJsonText,
  readJsonFile,
  type LoadedProfile,
} from "../load-profile.ts";
import { CONNECT_PROJECT, PULLED_ASSETS_DIR } from "../release.ts";
import { formatNext, type Remedy, guideStep } from "../remedy.ts";
import { SLUG_MESSAGE, SLUG_PATTERN, brandSchema } from "../schema.ts";
import { SITE_CONTENT_FILE } from "../site-content.ts";
import { FIREBASERC, applyProfile } from "./apply.ts";
import { CommandError, INSTALL_FIREBASE_CLI, runCommand, type CommandRunner } from "./gcloud.ts";
import { cliFlag, exitOnFailure } from "./main.ts";
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
  {
    path: "urls.spotlight",
    label: "Public site origin (https://…)",
    fallback: (answers) => `https://${text(answers, "slug")}.web.app`,
  },
  {
    path: "urls.backstage",
    label: "Admin site origin (https://…)",
    fallback: (answers) => `https://${text(answers, "slug")}-backstage.web.app`,
  },
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

const isProjectField = ({ path }: Field) => path.startsWith("firebase.");
/** The chapter itself: everything a local-only profile needs. */
const CHAPTER_FIELDS = PROFILE_FIELDS.filter((field) => !isProjectField(field));
/** The Firebase project, asked when there is one (or by --connect). */
const PROJECT_FIELDS = PROFILE_FIELDS.filter(isProjectField);

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
  if (!projectId) {
    throw new BrandConfigError(
      ["firebase.projectId is needed to read the web config"],
      [
        {
          change: "copy the Project ID into firebase.projectId of your answers",
          console: FIREBASE_SETTINGS,
        },
      ],
    );
  }
  for (const app of ["spotlight", "backstage"] as const) {
    const appId = text(answers, `firebase.web.${app}.appId`);
    if (!appId) {
      throw new BrandConfigError(
        [`firebase.web.${app}.appId is needed to read its config`],
        [
          {
            change: `copy the ${app} web app id into firebase.web.${app}.appId of your answers`,
            console: YOUR_APPS,
          },
        ],
      );
    }
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
    if (!parsed.success) {
      throw issuesToBrandError(label, parsed.error.issues, [INSTALL_FIREBASE_CLI]);
    }
    const config = parsed.data.result.sdkConfig;
    if (config.projectId !== projectId) {
      throw new BrandConfigError(
        [`${label}: app belongs to project "${config.projectId}", not "${projectId}"`],
        [{ change: `use the ${app} web app id of project "${projectId}"`, console: YOUR_APPS }],
      );
    }
    fillIfBlank(answers, `firebase.web.${app}.apiKey`, config.apiKey);
    fillIfBlank(answers, "firebase.web.authDomain", config.authDomain);
    fillIfBlank(answers, "firebase.web.messagingSenderId", config.messagingSenderId);
  }
}

export const ANSWERS_FILE = "brand-init-answers.json";

/**
 * A profile that runs only in the emulators (spec L1): a `demo-` project and placeholder
 * web apps, which the emulators accept and every release path refuses.
 */
/** Everything a project decides: what local mode fills in and --connect asks again. */
const PROJECT_KEYS = ["firebase", "assetsBucket", "deploy"] as const;

function localFirebase(answers: Answers): void {
  const projectId = demoProjectId(text(answers, "slug") ?? "chapter");
  const webApp = (app: string) => ({
    apiKey: "demo-api-key",
    appId: `1:0:web:${app}`,
    appCheckSiteKey: "",
    vapidKey: "",
  });
  set(answers, "firebase", {
    projectId,
    storageBucket: `${projectId}.firebasestorage.app`,
    sites: { spotlight: projectId, backstage: `${projectId}-backstage` },
    web: {
      authDomain: `${projectId}.firebaseapp.com`,
      messagingSenderId: "0",
      spotlight: webApp("spotlight"),
      backstage: webApp("backstage"),
    },
  });
  if (!text(answers, "assetsBucket")) set(answers, "assetsBucket", `${projectId}-brand-assets`);
}

const HAS_PROJECT = {
  key: "hasProject",
  label:
    "Does this chapter already have a Firebase project? n = try everything on this computer first, connect one later (y/N)",
};

const FIREBASE_SETTINGS = "Firebase console → Project settings";
const YOUR_APPS = `${FIREBASE_SETTINGS} → Your apps`;

/** What a new profile needs next, in docs/adopting.md order (spec L1, L5). */
export function initNext(slug: string, { local = false }: { local?: boolean } = {}): Remedy[] {
  return [
    {
      change: `put the ${ASSET_CONTRACT.length} images in ${PULLED_ASSETS_DIR}/ (its README.txt lists them), then check them (${guideStep("images")})`,
      run: "pnpm brand:check",
    },
    {
      change: `edit brand/${slug}/${SITE_CONTENT_FILE}: history, mission, contacts (these texts fill the site once; later you edit them in the admin /config screen)`,
    },
    {
      change: local
        ? "see your chapter's sites on this computer, with local test data (nothing leaves your machine)"
        : "see your chapter's sites on this computer, against the local emulators",
      run: "pnpm dev",
    },
    {
      change: `commit the profile (never ${PULLED_ASSETS_DIR}/: it is gitignored on purpose)`,
      run: `git add brand/${slug}/ ${CONFIG_FILE}`,
    },
    local ? CONNECT_PROJECT : { change: "check the whole setup", run: "pnpm brand:doctor" },
  ];
}

/** After --connect: confirm the project, then the Google Cloud setup. */
export const CONNECT_NEXT: readonly Remedy[] = [
  { change: `check the whole setup (${guideStep("doctor")})`, run: "pnpm brand:doctor" },
  {
    change: `print the Google Cloud setup, step by step, with your values (${guideStep("provision")}; changes nothing)`,
    run: "pnpm brand:provision",
  },
];

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
    `Your chapter's images, for the profile ${CONFIG_FILE} selects. Never commit this folder:`,
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

/** Asks each field the answers do not hold yet, re-asking a reply its check refuses. */
function asker(
  answers: Answers,
  exampleAnswers: Answers,
  repoRoot: string,
  prompter: Prompter | undefined,
) {
  return async (fields: readonly Field[]) => {
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
}

/** The Firebase project questions; resolves whether to read the keys with sdkconfig. */
async function askProject(
  ask: (fields: readonly Field[]) => Promise<void>,
  { prompter, fillWeb }: { prompter?: Prompter; fillWeb: boolean },
): Promise<boolean> {
  await ask(PROJECT_FIELDS);
  return (
    fillWeb ||
    (prompter !== undefined &&
      /^y/i.test(
        await prompter.ask({
          key: "fillWeb",
          label: "Read the API keys with firebase apps:sdkconfig? Needs firebase login (y/N)",
        }),
      ))
  );
}

/** The optional sdkconfig read, then the web keys it leaves unanswered. */
async function askWebKeys(
  ask: (fields: readonly Field[]) => Promise<void>,
  answers: Answers,
  { wanted, run }: { wanted: boolean; run: CommandRunner },
): Promise<void> {
  if (wanted) await fillWebConfig(answers, run);
  await ask(WEB_KEY_FIELDS);
}

/** The example profile's brand.json, the source of style defaults and the key order. */
function exampleProfile(repoRoot: string): { dir: string; answers: Answers } {
  const example = loadProfile({ repoRoot, profile: EXAMPLE_PROFILE });
  const json = readJsonFile(join(example.dir, "brand.json"), "example profile");
  return { dir: example.dir, answers: isRecord(json) ? json : {} };
}

/**
 * brand.json from answers, validated. It never gets a `deploy` section: that is the switch
 * that lets CD deploy, added at brand:provision step 2 once CD's account exists.
 */
function validBrand(answers: Answers, exampleAnswers: Answers) {
  const slug = String(answers.slug ?? "");
  const brand = orderLike(exampleAnswers, { $schema: "../brand.schema.json", ...answers });
  const parsed = brandSchema.safeParse(brand);
  if (!parsed.success) {
    throw issuesToBrandError(`brand/${slug || "<slug>"}/brand.json`, parsed.error.issues, [
      {
        change:
          "add or fix the fields above in your answers (brand/brand.schema.json describes each)",
      },
    ]);
  }
  return { slug, brand, data: parsed.data };
}

/**
 * Creates `brand/<slug>/` from answers (a file, prompts, or both), the example's site
 * content, and `brand-assets/README.txt`. Validates everything before writing anything.
 * `local` (or answering "no" to the project question) writes a local-only profile on a
 * `demo-` project; `brand:init --connect` attaches the real one later.
 */
export async function init({
  repoRoot = REPO_ROOT,
  answers: initial,
  prompter,
  fillWeb = false,
  local: wantLocal = false,
  run = runCommand,
}: {
  repoRoot?: string;
  answers: Answers;
  prompter?: Prompter;
  fillWeb?: boolean;
  local?: boolean;
  run?: CommandRunner;
}): Promise<{ slug: string; files: string[]; local: boolean }> {
  const example = exampleProfile(repoRoot);
  const answers: Answers = structuredClone(initial);
  const ask = asker(answers, example.answers, repoRoot, prompter);

  let local = wantLocal;
  // The sdkconfig answer, so a saved-answers re-run repeats it.
  let wanted = fillWeb;
  try {
    await ask(CHAPTER_FIELDS);
    local ||=
      prompter !== undefined &&
      get(answers, "firebase.projectId") === undefined &&
      !/^y/i.test(await prompter.ask(HAS_PROJECT));
    if (local && answers.firebase !== undefined) {
      throw new BrandConfigError(
        ['your answers have a "firebase" block, but a local-only profile runs on demo-<slug>'],
        [{ change: 'remove the "firebase" block, or drop --local to use that project' }],
      );
    }
    if (local) localFirebase(answers);
    else {
      wanted = await askProject(ask, { prompter, fillWeb });
      await askWebKeys(ask, answers, { wanted, run });
    }
    return { ...writeProfile({ repoRoot, answers, example }), local };
  } catch (error) {
    const flags = `${local ? " --local" : ""}${wanted ? " --sdkconfig" : ""}`;
    throw savedAnswers(error, { repoRoot, answers, prompter, flags });
  }
}

/**
 * Typed answers are not lost to a late failure: they become an --answers file, and the
 * error names the re-run. Anything else (a bug) is rethrown untouched.
 */
function savedAnswers(
  error: unknown,
  {
    repoRoot,
    answers,
    prompter,
    flags,
  }: { repoRoot: string; answers: Answers; prompter?: Prompter; flags: string },
): unknown {
  if (!prompter || !(error instanceof BrandConfigError || error instanceof CommandError)) {
    return error;
  }
  const saved = join(repoRoot, ANSWERS_FILE);
  writeFileSync(saved, `${JSON.stringify(answers, null, 2)}\n`);
  const reasons = error instanceof BrandConfigError ? error.errors : [error.message];
  return new BrandConfigError(
    [...reasons, `your answers are saved in ${saved}`],
    [
      ...error.remedies,
      {
        change: `fix them in ${saved}, then re-run from that file`,
        run: `pnpm brand:init --answers ${saved}${flags}`,
      },
    ],
  );
}

/** `base` with `over` merged in key by key, so a partial nested answer adds to, not replaces. */
function merged(base: Answers, over: Answers): Answers {
  const out: Answers = structuredClone(base);
  for (const [key, value] of Object.entries(over)) {
    const inner = out[key];
    out[key] = isRecord(value) && isRecord(inner) ? merged(inner, value) : structuredClone(value);
  }
  return out;
}

/** The project keys of a brand.json, or of answers. */
function projectPart(source: Answers): Answers {
  return Object.fromEntries(
    PROJECT_KEYS.filter((key) => source[key] !== undefined).map((key) => [key, source[key]]),
  );
}

function writeProfile({
  repoRoot,
  answers,
  example,
}: {
  repoRoot: string;
  answers: Answers;
  example: { dir: string; answers: Answers };
}): { slug: string; files: string[] } {
  const { slug, brand, data } = validBrand(answers, example.answers);
  const dir = join(repoRoot, "brand", slug);
  if (existsSync(dir)) {
    throw new BrandConfigError(
      [`brand/${slug} already exists`],
      [
        {
          change: `pick another slug, or edit brand/${slug}/brand.json directly`,
          run: "pnpm brand:check",
        },
      ],
    );
  }
  mkdirSync(dir);
  const files = [`brand/${slug}/brand.json`, `brand/${slug}/${SITE_CONTENT_FILE}`];
  writeFileSync(join(dir, "brand.json"), `${JSON.stringify(brand, null, 2)}\n`);
  copyFileSync(join(example.dir, SITE_CONTENT_FILE), join(dir, SITE_CONTENT_FILE));

  const assetsDir = join(repoRoot, PULLED_ASSETS_DIR);
  const readme = join(assetsDir, "README.txt");
  if (!existsSync(readme)) {
    mkdirSync(assetsDir, { recursive: true });
    writeFileSync(readme, assetReadme());
    files.push(`${PULLED_ASSETS_DIR}/README.txt`);
  }

  // The new chapter becomes the one this checkout builds.
  writeFileSync(join(repoRoot, CONFIG_FILE), configTemplate(slug));
  files.push(CONFIG_FILE);
  const profile: LoadedProfile = {
    slug,
    dir,
    brand: data,
    source: "file",
    warnings: [],
    localOnly: isDemoProject(data.firebase.projectId),
  };
  applyProfile({ profile, repoRoot, env: {} });
  files.push(FIREBASERC);
  return { slug, files };
}

/**
 * `brand:init --connect` (spec L2): asks only the Firebase questions for the profile
 * luminova.json selects, then rewrites brand.json and `.firebaserc`. It replaces a
 * local-only profile's demo project, or re-connects a connected one; CD's `deploy` names
 * survive only when the project stays the same.
 */
export async function connect({
  repoRoot = REPO_ROOT,
  answers: initial = {},
  prompter,
  fillWeb = false,
  run = runCommand,
}: {
  repoRoot?: string;
  answers?: Answers;
  prompter?: Prompter;
  fillWeb?: boolean;
  run?: CommandRunner;
}): Promise<{ slug: string; projectId: string }> {
  const profile = loadProfile({ repoRoot });
  const label = `brand/${profile.slug}/brand.json`;
  const json = readJsonFile(join(profile.dir, "brand.json"), label);
  const current: Answers = isRecord(json) ? json : {};
  // Every project question is asked again; a demo project's placeholders never are answers.
  const chapter = Object.fromEntries(
    Object.entries(current).filter(([key]) => !(PROJECT_KEYS as readonly string[]).includes(key)),
  );
  const answers = merged(chapter, initial);
  const example = exampleProfile(repoRoot);
  const ask = asker(answers, example.answers, repoRoot, prompter);
  let wanted = fillWeb;
  try {
    await ask(PROJECT_FIELDS.filter(({ path }) => path === "firebase.projectId"));
    // The same project again keeps every current value (App Check keys, CD's deploy names)
    // as its answer; only what the answers file changes is new.
    if (
      !profile.localOnly &&
      text(answers, "firebase.projectId") === profile.brand.firebase.projectId
    ) {
      Object.assign(answers, merged(projectPart(current), projectPart(answers)));
    }
    wanted = await askProject(ask, { prompter, fillWeb });
    await askWebKeys(ask, answers, { wanted, run });
    const { slug, brand, data } = validBrand(answers, example.answers);
    if (slug !== profile.slug) {
      throw new BrandConfigError(
        [`${label}: slug "${slug}" must stay "${profile.slug}"`],
        [{ change: `remove "slug" from your answers, or set it to "${profile.slug}"` }],
      );
    }
    writeFileSync(join(profile.dir, "brand.json"), `${JSON.stringify(brand, null, 2)}\n`);
    const localOnly = isDemoProject(data.firebase.projectId);
    applyProfile({ profile: { ...profile, brand: data, localOnly }, repoRoot, env: {} });
    return { slug, projectId: data.firebase.projectId };
  } catch (error) {
    const flags = ` --connect${wanted ? " --sdkconfig" : ""}`;
    throw savedAnswers(error, { repoRoot, answers, prompter, flags });
  }
}

if (import.meta.main) {
  await exitOnFailure(async () => {
    const argv = process.argv.slice(2);
    const answersFile = cliFlag("--answers", argv);
    // pnpm runs root scripts from the workspace root; INIT_CWD is where the user typed.
    const cwd = process.env.INIT_CWD ?? process.cwd();
    const answers = answersFile ? readJsonFile(resolve(cwd, answersFile), answersFile) : {};
    if (!isRecord(answers)) {
      throw new BrandConfigError(
        [`${answersFile}: must be a JSON object`],
        [
          {
            change: `make ${answersFile} a JSON object like the example in ${guideStep("profile")}`,
          },
        ],
      );
    }
    const prompter = answersFile ? undefined : terminalPrompter();
    const fillWeb = argv.includes("--sdkconfig");
    try {
      if (argv.includes("--connect")) {
        const { slug, projectId } = await connect({ answers, prompter, fillWeb });
        console.log(
          `brand:init: brand/${slug}/brand.json now uses Firebase project ${projectId}; ${FIREBASERC} rewritten.\n\n${formatNext(CONNECT_NEXT)}`,
        );
        return;
      }
      const { slug, files, local } = await init({
        answers,
        prompter,
        fillWeb,
        local: argv.includes("--local"),
      });
      const where = local
        ? " It runs on this computer only, until you connect a Firebase project."
        : "";
      console.log(
        `brand:init: wrote ${files.join(", ")}. ${CONFIG_FILE} now selects "${slug}".${where}\n\n${formatNext(initNext(slug, { local }))}`,
      );
    } finally {
      prompter?.close();
    }
  });
}
