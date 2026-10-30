import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import {
  ASSET_CONTRACT,
  ICON_FILES,
  ICON_MASTER_FILE,
  ICON_MASTER_SVG_FILE,
  MIN_ICON_MASTER_SIZE,
  describeSpec,
} from "../assets.ts";
import {
  BRAND_FILE,
  SCHEMA_LINE,
  parseBrandToml,
  resolveBrandFile,
  valueAt,
} from "../brand-file.ts";
import { BRAND_APPS } from "../ports.ts";
import {
  BrandConfigError,
  EXAMPLE_PROFILE,
  REPO_ROOT,
  brandFileLabel,
  demoProjectId,
  isDemoProject,
  issuesToBrandError,
  loadProfile,
  parseJsonText,
  readBase,
  readJsonFile,
  type LoadedProfile,
} from "../load-profile.ts";
import { LOCAL_PROFILE, isSeededBrandFile, localDir, localLabel } from "../local-folder.ts";
import { CONNECT_PROJECT } from "../release.ts";
import { formatNext, type Remedy, guideStep } from "../remedy.ts";
import { CHAPTER_IDENTITY, isTable, type Table } from "../schema.ts";
import { FIREBASERC, applyProfile } from "./apply.ts";
import { CommandError, runCommand, type CommandRunner } from "./gcloud.ts";
import { INSTALL_FIREBASE_CLI } from "./install.ts";
import { runBrandCommand } from "./main.ts";
import { isYes, terminalPrompter, type Prompter } from "./prompts.ts";
import { seedLocal } from "./seed.ts";

type Answers = Record<string, unknown>;

const get = (answers: Answers, path: string): unknown => valueAt(answers, path.split("."));

function set(answers: Answers, path: string, value: unknown): void {
  const keys = path.split(".");
  const last = keys.pop() ?? path;
  let node = answers;
  for (const key of keys) {
    const child = node[key];
    const next: Answers = isTable(child) ? child : {};
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
  /** `int` takes a whole number; `blank` keeps "" (feature off) instead of leaving the key out. */
  kind?: "int" | "blank";
  /** Re-asked at once while this returns a reason (interactive only; a file is checked whole). */
  check?: (reply: string) => string | undefined;
}

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

/** The chapter itself: everything a local-only profile needs. */
const CHAPTER_FIELDS: readonly Field[] = [
  { path: "name", label: "Chapter name (e.g. JCI Andina)" },
  { path: "city", label: "City, as used in a sentence (e.g. Cochabamba)" },
  { path: "country", label: "Country" },
  { path: "foundedYear", label: "Year founded", kind: "int" },
  {
    path: "colors.spotlight",
    label: "Public site theme colour, #RRGGBB",
    fallback: (_, example) => text(example, "colors.spotlight"),
    check: (reply) => (HEX_COLOR.test(reply) ? undefined : `"${reply}" must be a #RRGGBB color`),
  },
];

/** The Firebase project, asked when there is one, or when connecting one later. */
const PROJECT_FIELDS: readonly Field[] = [
  { path: "project", label: "Firebase project id" },
  { path: "firebase.spotlight.appId", label: "Public site web app id (1:…:web:…)" },
  { path: "firebase.backstage.appId", label: "Admin site web app id (1:…:web:…)" },
];

/** Asked after the optional sdkconfig read, which can fill the API keys. */
const WEB_KEY_FIELDS: readonly Field[] = [
  { path: "firebase.spotlight.apiKey", label: "Public site API key" },
  { path: "firebase.backstage.apiKey", label: "Admin site API key" },
  {
    path: "firebase.spotlight.appCheckSiteKey",
    label: "Public site App Check key (blank: off)",
    kind: "blank",
  },
  {
    path: "firebase.spotlight.vapidKey",
    label: "Public site web push key (blank: off)",
    kind: "blank",
  },
  {
    path: "firebase.backstage.appCheckSiteKey",
    label: "Admin site App Check key (blank: off)",
    kind: "blank",
  },
  {
    path: "firebase.backstage.vapidKey",
    label: "Admin site web push key (blank: off)",
    kind: "blank",
  },
];

const WEB_KEYS = ["apiKey", "appId", "appCheckSiteKey", "vapidKey"] as const;

/** The answers brand:init takes: the identity, the year and the project; brand.toml holds the rest. */
const ANSWER_KEYS = [
  ...new Set([...CHAPTER_IDENTITY.flatMap((path) => path.slice(0, 1)), "foundedYear", "firebase"]),
];

const sdkconfigSchema = z.object({
  result: z.object({
    sdkConfig: z.object({
      projectId: z.string(),
      apiKey: z.string(),
    }),
  }),
});

function fillIfBlank(answers: Answers, path: string, value: string): void {
  if (!text(answers, path)) set(answers, path, value);
}

/**
 * Reads each web app's config with `firebase apps:sdkconfig` (read-only) and fills the API
 * keys. Its auth domain and sender id are the ones brand.toml derives from the project.
 */
async function fillWebConfig(answers: Answers, run: CommandRunner): Promise<void> {
  const projectId = text(answers, "project");
  if (!projectId) {
    throw new BrandConfigError(
      ["project is needed to read the web config"],
      [{ change: "copy the Project ID into project of your answers", console: FIREBASE_SETTINGS }],
    );
  }
  for (const app of BRAND_APPS) {
    const appId = text(answers, `firebase.${app}.appId`);
    if (!appId) {
      throw new BrandConfigError(
        [`firebase.${app}.appId is needed to read its config`],
        [
          {
            change: `copy the ${app} web app id into firebase.${app}.appId of your answers`,
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
    fillIfBlank(answers, `firebase.${app}.apiKey`, config.apiKey);
  }
}

export const ANSWERS_FILE = "brand-init-answers.json";

const HAS_PROJECT = {
  key: "hasProject",
  label:
    "Does this chapter already have a Firebase project? n = try everything on this computer first, connect one later (y/N)",
};

const FIREBASE_SETTINGS = "Firebase console → Project settings";
const YOUR_APPS = `${FIREBASE_SETTINGS} → Your apps`;

/** What a new profile needs next, in docs/adopting.md order (spec L1, L5). */
export function initNext({ local = false }: { local?: boolean } = {}): Remedy[] {
  return [
    {
      change: `replace the example's ${ASSET_CONTRACT.length} images in ${localLabel()} with your chapter's (its README.txt lists them), then check them (${guideStep("images")})`,
      run: "pnpm brand:check",
    },
    {
      change: `edit ${localLabel(BRAND_FILE)}: history, mission, contacts. Copy any key or table you want to change from brand/${EXAMPLE_PROFILE}/${BRAND_FILE} (these texts fill the site once; later you edit them in the admin /config screen)`,
    },
    {
      change: local
        ? "see your chapter's sites on this computer, with local test data (nothing leaves your machine)"
        : "see your chapter's sites on this computer, against the local emulators",
      run: "pnpm dev",
    },
    local ? CONNECT_PROJECT : { change: "check the whole setup", run: "pnpm brand:check" },
  ];
}

/** After connecting: confirm the project, then the Google Cloud setup. */
const CONNECT_NEXT: readonly Remedy[] = [
  { change: `check the whole setup (${guideStep("check")})`, run: "pnpm brand:check" },
  {
    change: `print the Google Cloud setup, step by step, with your values (${guideStep("provision")}; changes nothing)`,
    run: "pnpm brand:provision",
  },
];

function assetReadme(): string {
  const rows = ASSET_CONTRACT.map((spec) => `  ${spec.path.padEnd(40)}${describeSpec(spec)}`);
  return [
    "Your chapter's brand: brand.toml and its images. Never commit this folder: it is",
    "gitignored; pnpm brand:push uploads it to the profile's private bucket, which deployments read.",
    "",
    `Put these ${ASSET_CONTRACT.length} PNG files here, then run pnpm brand:check:`,
    "",
    ...rows,
    "",
    "The three logos must share one size. Keep og-image.png under 300 KB so WhatsApp shows it.",
    "",
    `The ${ICON_FILES.length * BRAND_APPS.length} icons can be generated: put your logo mark here as ${ICON_MASTER_SVG_FILE} (any square`,
    `SVG) or ${ICON_MASTER_FILE} (a square PNG of at least ${MIN_ICON_MASTER_SIZE}×${MIN_ICON_MASTER_SIZE}), best on a transparent background,`,
    "then run pnpm brand:icons.",
    "",
    "When the set passes, upload it with pnpm brand:push (see docs/adopting.md).",
    "",
  ].join("\n");
}

const WHOLE = /^\d+$/;

function checkReply(field: Field, reply: string): string | undefined {
  if (field.kind === "int" && !WHOLE.test(reply)) return `"${reply}" must be a whole number`;
  return field.check?.(reply);
}

/** Asks each field the answers do not hold yet, re-asking a reply its check refuses. */
function asker(
  answers: Answers,
  exampleAnswers: Answers,
  prompter: Prompter | undefined,
  /** Values offered first as the default, e.g. a project's current ones on re-connect. */
  defaults: Answers = {},
) {
  return async (fields: readonly Field[]) => {
    for (const field of fields) {
      if (get(answers, field.path) !== undefined) continue;
      const fallback = text(defaults, field.path) ?? field.fallback?.(answers, exampleAnswers);
      let reply: string;
      let error: string | undefined;
      do {
        reply =
          (await prompter?.ask({ key: field.path, label: field.label, fallback, error })) ||
          fallback ||
          "";
        error = prompter && reply !== "" ? checkReply(field, reply) : undefined;
      } while (error);
      if (reply !== "" || field.kind === "blank") {
        set(answers, field.path, field.kind === "int" && WHOLE.test(reply) ? Number(reply) : reply);
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
      (await yes(
        prompter,
        "fillWeb",
        "Read the API keys with firebase apps:sdkconfig? Needs firebase login",
      )))
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

/** brand/local/ holds a brand.toml that is the chapter's own, not the one install seeded. */
const holdsOwnBrandFile = (repoRoot: string) =>
  existsSync(join(localDir(repoRoot), BRAND_FILE)) && !isSeededBrandFile(repoRoot);

/**
 * The chapter's own brand.toml is replaced only when the member said so (runInit asks).
 * Checked before the first question, so nobody answers them for nothing.
 */
function refuseReplacing(repoRoot: string): void {
  if (!holdsOwnBrandFile(repoRoot)) return;
  const label = localLabel(BRAND_FILE);
  throw new BrandConfigError(
    [`${label} already holds your chapter's brand; brand:init replaces it only when you say so.`],
    [
      {
        change: `edit ${label} to change its values, or run this in a terminal and answer y to connect it to a Firebase project or to start over`,
        run: "pnpm brand:init",
      },
    ],
  );
}

/** The chapter's name as a project id part: "JCI Andina" → "jci-andina". */
const nameSlug = (name: string | undefined) =>
  (name ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "chapter";

/** Refuses an answers file with keys brand:init never asks, before any question. */
function refuseOtherAnswers(answers: Answers): void {
  const others = Object.keys(answers).filter((key) => !ANSWER_KEYS.includes(key));
  if (others.length === 0) return;
  throw new BrandConfigError(
    others.map(
      (key) =>
        `brand-init-answers: "${key}" is not an answer brand:init takes (it asks ${ANSWER_KEYS.join(", ")})`,
    ),
    [{ change: `remove it from your answers, and set it in the ${BRAND_FILE} brand:init writes` }],
  );
}

const tomlString = (value: unknown) => JSON.stringify(String(value));

/** `[firebase.<app>]` with each web key answered, blanks left out. */
function webTables(answers: Answers): string[] {
  const lines: string[] = [];
  for (const app of BRAND_APPS) {
    const keys = WEB_KEYS.filter((key) => text(answers, `firebase.${app}.${key}`));
    if (keys.length === 0) continue;
    lines.push(
      "",
      `[firebase.${app}]`,
      ...keys.map((key) => `${key} = ${tomlString(get(answers, `firebase.${app}.${key}`))}`),
    );
  }
  return lines;
}

/**
 * A new chapter's brand.toml: the schema line, the identity, the project and its web apps.
 * Everything else comes from the example, which the header points at.
 */
function renderBrandToml(answers: Answers, example: Table): string {
  // An unanswered key is left out, so the schema reports it as required.
  const line = (key: string, path = key) => {
    const value = get(answers, path);
    if (value === undefined) return [];
    return [`${key} = ${typeof value === "number" ? String(value) : tomlString(value)}`];
  };
  return [
    SCHEMA_LINE,
    `# ${String(answers.name ?? "Your chapter")}'s brand. Every key left out comes from brand/${EXAMPLE_PROFILE}/${BRAND_FILE},`,
    "# which shows them all: copy one here to change it, then run pnpm brand:check.",
    ...line("name"),
    ...line("city"),
    ...line("country"),
    "# The Firebase project. A demo- project runs only in the emulators; pnpm brand:init connects a real one.",
    ...line("project"),
    ...(answers.foundedYear === undefined
      ? [
          "# The year the chapter was founded, which the site states; until set, it is the example's:",
          `# foundedYear = ${String(example.foundedYear)}`,
        ]
      : ["# The year the chapter was founded, which the site states.", ...line("foundedYear")]),
    "",
    "[colors]",
    ...line("spotlight", "colors.spotlight"),
    ...webTables(answers),
    "",
  ].join("\n");
}

/**
 * brand:init wrote this text, so a syntax error in it is no line the member typed: the
 * message says so instead of asking them to fix their file.
 */
function parseGenerated(toml: string, label: string): Table {
  try {
    return parseBrandToml(toml, label);
  } catch (error) {
    if (!(error instanceof BrandConfigError)) throw error;
    const where = error.errors.map((line) => line.replace(`${label}: `, "")).join("; ");
    throw new BrandConfigError(
      [
        `brand:init built ${label} from your answers, but it does not parse (${where}); nothing was written`,
      ],
      [
        {
          change:
            "check your answers for unusual characters (such as control characters); if they hold none, report this as a brand:init bug",
        },
      ],
    );
  }
}

/** The resolved profile of a brand.toml text, so nothing invalid is ever written. */
function validated(
  toml: string,
  { slug, dir, example }: { slug: string; dir: string; example: Table },
): LoadedProfile {
  const label = brandFileLabel(slug);
  const resolved = resolveBrandFile({
    slug,
    chapter: parseGenerated(toml, label),
    base: example,
    label,
    baseLabel: brandFileLabel(EXAMPLE_PROFILE),
  });
  return {
    slug,
    dir,
    assetsDir: dir,
    ...resolved,
    source: "local",
    warnings: [],
    localOnly: isDemoProject(resolved.brand.firebase.projectId),
  };
}

/**
 * Writes `brand/local/brand.toml` from answers (a file, prompts, or both), seeding a
 * missing brand/local/ first and adding its README.txt. Validates everything before writing
 * anything. The chapter's own brand.toml is replaced only with `replace`; the seeded one
 * always. `local` (or answering "no" to the project question) writes a local-only profile on
 * a `demo-` project; running brand:init again connects the real one later.
 */
export async function init({
  repoRoot = REPO_ROOT,
  answers: initial,
  prompter,
  fillWeb = false,
  local: wantLocal = false,
  replace = false,
  run = runCommand,
}: {
  repoRoot?: string;
  answers: Answers;
  prompter?: Prompter;
  fillWeb?: boolean;
  local?: boolean;
  /** The caller decided an existing brand.toml may go: the member said yes, or it is the seed. */
  replace?: boolean;
  run?: CommandRunner;
}): Promise<{ files: string[]; local: boolean }> {
  if (!replace) refuseReplacing(repoRoot);
  refuseOtherAnswers(initial);
  const example = readBase(repoRoot);
  const answers: Answers = structuredClone(initial);
  const ask = asker(answers, example, prompter);

  let local = wantLocal;
  try {
    await ask(CHAPTER_FIELDS);
    local ||=
      prompter !== undefined &&
      answers.project === undefined &&
      !isYes(await prompter.ask(HAS_PROJECT));
    if (local && (answers.project !== undefined || answers.firebase !== undefined)) {
      throw new BrandConfigError(
        [
          "your answers name a project and its web apps, but a local-only profile runs on demo-<chapter name>",
        ],
        [
          {
            change:
              'remove "project" and "firebase" from your answers: a local-only profile makes its own',
          },
        ],
      );
    }
    if (local) answers.project = demoProjectId(nameSlug(text(answers, "name")));
    else {
      const wanted = await askProject(ask, { prompter, fillWeb });
      await askWebKeys(ask, answers, { wanted, run });
    }
    return { ...writeProfile({ repoRoot, answers, example }), local };
  } catch (error) {
    // A local profile's demo project is made again on the next try; saving it would make
    // that try refuse its own file.
    const chapter = Object.fromEntries(
      Object.entries(answers).filter(([key]) => key !== "project" && key !== "firebase"),
    );
    throw savedAnswers(error, { repoRoot, answers: local ? chapter : answers, prompter });
  }
}

/**
 * Typed answers are not lost to a late failure: they are saved, and the next brand:init
 * offers them. Anything else (a bug) is rethrown untouched.
 */
function savedAnswers(
  error: unknown,
  { repoRoot, answers, prompter }: { repoRoot: string; answers: Answers; prompter?: Prompter },
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
        change: `fix them in ${saved} if needed, then run it again and answer y to use them`,
        run: "pnpm brand:init",
      },
    ],
  );
}

function writeProfile({
  repoRoot,
  answers,
  example,
}: {
  repoRoot: string;
  answers: Answers;
  example: Table;
}): { files: string[] } {
  const dir = localDir(repoRoot);
  const toml = renderBrandToml(answers, example);
  const profile = validated(toml, { slug: LOCAL_PROFILE, dir, example });
  // The example's images keep dev running until the chapter's replace them.
  seedLocal({ repoRoot, env: {} });
  const files = [localLabel(BRAND_FILE)];
  writeFileSync(join(dir, BRAND_FILE), toml);

  const readme = join(dir, "README.txt");
  if (!existsSync(readme)) {
    writeFileSync(readme, assetReadme());
    files.push(localLabel("README.txt"));
  }

  // brand/local/brand.toml is what brand/ selects, so every command now reads it.
  applyProfile({ profile, repoRoot, env: {} });
  files.push(FIREBASERC);
  return { files };
}

/** A line or a whole `[table]` of a brand.toml: its header up to the next header. */
const TABLE_HEADER = /^\s*\[/;
const isHeader = (line: string, table: string) =>
  new RegExp(`^\\s*\\[\\s*${table.replace(".", "\\s*\\.\\s*")}\\s*\\]\\s*(#.*)?$`).test(line);

const isNote = (line: string) => /^\s*(#.*)?$/.test(line);

/**
 * Drops each of `tables`, header to next header. Comments and blank lines right before the
 * next header belong to that header, so they stay unless it is dropped too.
 */
function withoutTables(lines: readonly string[], tables: readonly string[]): string[] {
  const out: string[] = [];
  let skipping = false;
  let notes: string[] = [];
  for (const line of lines) {
    if (TABLE_HEADER.test(line)) {
      skipping = tables.some((table) => isHeader(line, table));
      if (!skipping) out.push(...notes);
      notes = [];
    } else if (skipping) {
      notes = isNote(line) ? [...notes, line] : [];
      continue;
    }
    if (!skipping) out.push(line);
  }
  return out;
}

/**
 * The connected project in a chapter's own brand.toml text: the `project` line and the
 * web app tables are rewritten, and every other line, comments included, stays. A new
 * project drops `[deploy]`, which names the old one, and pins the QR prefix printed
 * credentials already carry.
 */
function connectedToml(
  toml: string,
  answers: Answers,
  { pinQrPrefix }: { pinQrPrefix?: string },
): string {
  const replaced = [...(pinQrPrefix ? ["deploy"] : []), "firebase.spotlight", "firebase.backstage"];
  const kept = withoutTables(toml.trimEnd().split("\n"), replaced);
  const header = kept.findIndex((line) => TABLE_HEADER.test(line));
  const top = header === -1 ? kept.length : header;
  const projectLine = `project = ${tomlString(answers.project)}`;
  const topLine = (key: string) =>
    kept.slice(0, top).findIndex((line) => new RegExp(`^\\s*${key}\\s*=`).test(line));
  const at = topLine("project");
  // A prefix already written is the one credentials carry: it stays as it is.
  const pin = pinQrPrefix !== undefined && topLine("qrPrefix") === -1;
  const extra = pin ? [`qrPrefix = ${tomlString(pinQrPrefix)}`] : [];
  if (at === -1) kept.splice(top, 0, projectLine, ...extra);
  else kept.splice(at, 1, projectLine, ...extra);
  return `${kept.join("\n").trimEnd()}\n${webTables(answers).join("\n")}\n`;
}

/** The project part of a chapter's brand.toml, as answers. */
function projectAnswers(file: Table): Answers {
  const firebase = isTable(file.firebase) ? file.firebase : {};
  const apps = Object.fromEntries(
    BRAND_APPS.filter((app) => isTable(firebase[app])).map((app) => [app, firebase[app]]),
  );
  return { project: file.project, firebase: apps };
}

/**
 * Connecting (spec L2): asks only the Firebase questions for the profile brand/ selects,
 * then rewrites its project lines and `.firebaserc`. It replaces a local-only profile's
 * demo project, or re-connects a connected one; `[deploy]` survives only when the project
 * stays the same.
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
  const { slug, dir } = profile;
  const label = brandFileLabel(slug);
  const toml = readFileSync(join(dir, BRAND_FILE), "utf8");
  const current = projectAnswers(parseBrandToml(toml, label));
  const answers: Answers = structuredClone({
    ...(initial.project !== undefined ? { project: initial.project } : {}),
    ...(initial.firebase !== undefined ? { firebase: initial.firebase } : {}),
  });
  const example = readBase(repoRoot);
  // Re-connecting offers the current project's values as defaults (Enter keeps one, a
  // reply replaces it); a demo project's placeholders are never offered.
  const defaults = profile.localOnly ? {} : current;
  const ask = asker(answers, example, prompter, defaults);
  try {
    await ask(PROJECT_FIELDS.filter(({ path }) => path === "project"));
    const before = profile.brand.firebase.projectId;
    const sameProject = text(answers, "project") === before;
    if (!sameProject) for (const key of Object.keys(defaults)) delete defaults[key];
    const wanted = await askProject(ask, { prompter, fillWeb });
    await askWebKeys(ask, answers, { wanted, run });
    const pinQrPrefix = sameProject || profile.localOnly ? undefined : profile.brand.qrPrefix;
    const next = connectedToml(toml, answers, { pinQrPrefix });
    const connected = validated(next, { slug, dir, example });
    writeFileSync(join(dir, BRAND_FILE), next);
    applyProfile({ profile: { ...connected, source: profile.source }, repoRoot, env: {} });
    return { slug, projectId: connected.brand.firebase.projectId };
  } catch (error) {
    throw savedAnswers(error, { repoRoot, answers, prompter });
  }
}

const yes = async (prompter: Prompter, key: string, label: string) =>
  isYes(await prompter.ask({ key, label: `${label} (y/N)` }));

function readSavedAnswers(file: string): Answers {
  const answers = readJsonFile(file, ANSWERS_FILE);
  if (isTable(answers)) return answers;
  throw new BrandConfigError(
    [`${ANSWERS_FILE}: must be a JSON object`],
    [{ change: `delete ${ANSWERS_FILE} and answer the questions again`, run: "pnpm brand:init" }],
  );
}

/**
 * `pnpm brand:init`: creates the chapter's profile or, once brand/ has one, offers to
 * connect it to a Firebase project (spec R27 C4). The answers a failed try saved are offered
 * first, and removed once a run succeeds. Returns what to print.
 */
export async function runInit({
  repoRoot = REPO_ROOT,
  prompter,
  run = runCommand,
}: {
  repoRoot?: string;
  /** The terminal; absent in a script or CI, where nobody can answer. */
  prompter?: Prompter;
  run?: CommandRunner;
}): Promise<string> {
  if (!prompter) {
    throw new BrandConfigError(
      ["brand:init asks questions, so it needs a terminal."],
      [{ change: "run it in a terminal", run: "pnpm brand:init" }],
    );
  }
  const savedFile = join(repoRoot, ANSWERS_FILE);
  const useSaved =
    existsSync(savedFile) &&
    (await yes(
      prompter,
      "useSaved",
      `Use the answers saved from your last try (${ANSWERS_FILE})?`,
    ));
  const answers = useSaved ? readSavedAnswers(savedFile) : {};

  let output: string | undefined;
  if (holdsOwnBrandFile(repoRoot)) {
    const label = localLabel(BRAND_FILE);
    const profile = loadProfile({ repoRoot, profile: LOCAL_PROFILE });
    const question = profile.localOnly
      ? `${localLabel()} runs on this computer only. Connect it to a Firebase project now?`
      : `${localLabel()} uses Firebase project ${profile.brand.firebase.projectId}. Connect it again, to change the project or its keys?`;
    if (await yes(prompter, "connect", question)) {
      const { slug, projectId } = await connect({ repoRoot, answers, prompter, run });
      output = `brand:init: ${brandFileLabel(slug)} now uses Firebase project ${projectId}; ${FIREBASERC} rewritten.\n\n${formatNext(CONNECT_NEXT)}`;
    } else if (
      !(await yes(
        prompter,
        "replace",
        `Replace ${label} with a new one, answering every question again?`,
      ))
    ) {
      return `brand:init: nothing changed. To change its other values, edit ${label}.`;
    }
  }
  if (output === undefined) {
    // Decided above: the seeded brand.toml, none, or the member said yes to replacing theirs.
    const { files, local } = await init({ repoRoot, answers, prompter, replace: true, run });
    const where = local
      ? " It runs on this computer only, until you connect a Firebase project."
      : "";
    output = `brand:init: wrote ${files.join(", ")}.${where}\n\n${formatNext(initNext({ local }))}`;
  }
  // Used or declined, saved answers are stale once a run succeeds: offered again, they would
  // answer the next run's questions (a connect skips the project id it finds there).
  rmSync(savedFile, { force: true });
  return output;
}

if (import.meta.main) {
  await runBrandCommand("brand:init", async () => {
    const prompter = process.stdin.isTTY ? terminalPrompter() : undefined;
    try {
      console.log(await runInit({ prompter }));
    } finally {
      prompter?.close();
    }
  });
}
