import { readFileSync } from "node:fs";
import { TomlError, parse } from "smol-toml";
import { BrandConfigError, errorMessage } from "./errors.ts";
import type { Remedy } from "./remedy.ts";
import { brandFileSchema, toBrand, type Brand } from "./schema.ts";
import { toSiteContent, type SiteContent } from "./site-content.ts";

export const BRAND_FILE = "brand.toml";

/** Line 1 of a brand.toml: Taplo and Even Better TOML read it for hover help and completion. */
export const SCHEMA_LINE = "#:schema ../brand.schema.json";

export type Table = Record<string, unknown>;

export const isTable = (value: unknown): value is Table =>
  typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Date);

/** Parses a brand.toml; a syntax error names the file, the line and the column. */
export function parseBrandToml(text: string, label: string): Table {
  try {
    return parse(text);
  } catch (error) {
    if (!(error instanceof TomlError)) throw error;
    const reason = error.message.replace(/^Invalid TOML document: /, "").split("\n")[0];
    throw new BrandConfigError(
      [`${label}: line ${error.line}, column ${error.column}: ${reason}`],
      [{ change: `fix the TOML syntax in ${label} at that line` }],
    );
  }
}

export function readBrandToml(file: string, label: string): Table {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (error) {
    throw new BrandConfigError(
      [`${label}: cannot read (${errorMessage(error)})`],
      [{ change: `check that ${label} exists and is a readable file` }],
    );
  }
  return parseBrandToml(text, label);
}

/** `over` on `base`: tables merge key by key; anything else, an array included, replaces. */
export function layer(base: Table, over: Table): Table {
  const out: Table = { ...base };
  for (const [key, value] of Object.entries(over)) {
    const inner = out[key];
    out[key] = isTable(value) && isTable(inner) ? layer(inner, value) : value;
  }
  return out;
}

/**
 * The example's identity, which no chapter inherits: a chapter names its own, or the
 * schema says it is required.
 */
const IDENTITY: readonly (readonly string[])[] = [
  ["name"],
  ["city"],
  ["country"],
  ["project"],
  ["colors", "spotlight"],
  ["firebase", "spotlight"],
  ["firebase", "backstage"],
];

function without(table: Table, path: readonly string[]): Table {
  const [key, ...rest] = path;
  if (key === undefined || !(key in table)) return table;
  const { [key]: child, ...others } = table;
  if (rest.length === 0) return others;
  if (!isTable(child)) return table;
  const inner = without(child, rest);
  return Object.keys(inner).length > 0 ? { ...others, [key]: inner } : others;
}

/** The example as a base layer: everything but its identity. */
export const baseLayer = (example: Table): Table => IDENTITY.reduce(without, example);

/** Each placeholder and the key that holds its value. */
const PLACEHOLDERS: Readonly<Record<string, readonly string[]>> = {
  name: ["name"],
  shortName: ["shortName"],
  city: ["city"],
  cityFormal: ["locality", "cityFormal"],
  region: ["locality", "region"],
  regionShort: ["locality", "regionShort"],
  country: ["country"],
  movementName: ["movementName"],
};

const PLACEHOLDER = /\{([^{}\s]*)\}/g;
const KNOWN = Object.keys(PLACEHOLDERS)
  .map((key) => `{${key}}`)
  .join(", ");

type Path = readonly (string | number)[];

function valueAt(root: unknown, path: readonly PropertyKey[]): unknown {
  let node = root;
  for (const key of path) {
    if (Array.isArray(node) && typeof key === "number") node = node[key];
    else if (isTable(node) && typeof key === "string") node = node[key];
    else return undefined;
  }
  return node;
}

/**
 * Where a key sits, the way brand.toml writes it: `name`, `[contact] email`,
 * `[[timeline]] 3, year` (counting from 1), `[og] legacyPaths, item 1`.
 */
export function tomlLocation(path: readonly PropertyKey[], data: unknown): string {
  const keys = path.map(String);
  const index = path.findLastIndex((key) => typeof key === "number");
  if (index === -1) {
    if (keys.length === 0) return "(top level)";
    if (keys.length === 1) return keys[0] ?? "";
    return `[${keys.slice(0, -1).join(".")}] ${keys.at(-1)}`;
  }
  const array = path.slice(0, index);
  const n = Number(path[index]) + 1;
  const rest = keys.slice(index + 1);
  if (rest.length > 0) return `[[${array.map(String).join(".")}]] ${n}, ${rest.join(".")}`;
  if (isTable(valueAt(data, path))) return `[[${array.map(String).join(".")}]] ${n}`;
  return `${tomlLocation(array, data)}, item ${n}`;
}

interface Layers {
  /** The chapter's own file, or undefined when the example loads as itself. */
  chapter?: Table;
  base: Table;
  label: string;
  baseLabel: string;
}

/**
 * The file to fix for a merged key: the example's when the value came from it untouched,
 * else the chapter's (it set the key, an array above it, or nobody did).
 */
function ownerOf(layers: Layers, path: readonly PropertyKey[]): string {
  if (!layers.chapter) return layers.baseLabel;
  let own: unknown = layers.chapter;
  for (const key of path) {
    if (Array.isArray(own)) return layers.label;
    if (!isTable(own) || typeof key !== "string" || !(key in own)) {
      return valueAt(layers.base, path) === undefined ? layers.label : layers.baseLabel;
    }
    own = own[key];
  }
  return layers.label;
}

/**
 * Expands `{name}`-style placeholders in every string, after the merge. A placeholder whose
 * key is missing stays as written: the schema then names that key.
 */
function expandTemplates(merged: Table, layers: Layers): Table {
  const errors: string[] = [];
  const resolved = new Map<string, string | undefined>();
  const resolving = new Set<string>();

  const expand = (text: string, path: Path): string =>
    text.replace(PLACEHOLDER, (whole, key: string) => {
      if (!(key in PLACEHOLDERS)) {
        errors.push(
          `${ownerOf(layers, path)} ${tomlLocation(path, merged)}: unknown placeholder ${whole} (the placeholders are ${KNOWN})`,
        );
        return whole;
      }
      return placeholder(key, path) ?? whole;
    });

  const placeholder = (key: string, from: Path): string | undefined => {
    if (resolved.has(key)) return resolved.get(key);
    const path = PLACEHOLDERS[key] ?? [];
    if (resolving.has(key)) {
      errors.push(
        `${ownerOf(layers, from)} ${tomlLocation(from, merged)}: {${key}} refers back to itself`,
      );
      return undefined;
    }
    const raw = valueAt(merged, path);
    // Missing or blank: the schema names that key, so its dependents stay as written.
    if (typeof raw !== "string" || raw.trim() === "") return undefined;
    resolving.add(key);
    const value = expand(raw, path);
    resolving.delete(key);
    resolved.set(key, value);
    return value;
  };

  const walk = (node: unknown, path: Path): unknown => {
    if (typeof node === "string") return expand(node, path);
    if (Array.isArray(node)) return node.map((item, index) => walk(item, [...path, index]));
    if (isTable(node)) {
      return Object.fromEntries(
        Object.entries(node).map(([key, value]) => [key, walk(value, [...path, key])]),
      );
    }
    return node;
  };

  const out = walk(merged, []);
  if (errors.length > 0) {
    throw new BrandConfigError([...new Set(errors)], [editRemedy(layers.label)]);
  }
  return isTable(out) ? out : {};
}

const editRemedy = (label: string): Remedy => ({
  change: `edit the keys above in ${label} (brand/brand.schema.json describes each; brand/example/brand.toml shows every one)`,
  run: "pnpm brand:check",
});

interface Issue {
  path: readonly PropertyKey[];
  message: string;
  code?: string;
  keys?: readonly string[];
  input?: unknown;
}

function issueLines(issue: Issue, data: unknown, layers: Layers): string[] {
  const line = (path: readonly PropertyKey[], text: string) =>
    `${ownerOf(layers, path)} ${tomlLocation(path, data)}: ${text}`;
  if (issue.code === "unrecognized_keys" && issue.keys) {
    return issue.keys.map((key) => line([...issue.path, key], "unknown key (a typo?)"));
  }
  if (issue.code === "invalid_type" && issue.input === undefined) {
    return [line(issue.path, "required")];
  }
  if (issue.code === "too_small" && typeof issue.input === "string") {
    return [line(issue.path, "must not be blank")];
  }
  return [line(issue.path, issue.message)];
}

export interface ResolvedBrandFile {
  brand: Brand;
  siteContent: SiteContent;
}

/**
 * A brand.toml as the builds read it: the chapter on the example's base layer, templates
 * expanded on the merged value, validated, then the defaults derived from `project`.
 * Without a chapter, the example resolves on its own.
 */
export function resolveBrandFile({
  slug,
  chapter,
  base,
  label,
  baseLabel,
}: Layers & { slug: string }): ResolvedBrandFile {
  const layers: Layers = { chapter, base: chapter ? baseLayer(base) : base, label, baseLabel };
  const merged = chapter ? layer(layers.base, chapter) : base;
  const expanded = expandTemplates(merged, layers);
  const parsed = brandFileSchema.safeParse(expanded, { reportInput: true });
  if (!parsed.success) {
    const lines = parsed.error.issues.flatMap((issue) => issueLines(issue, expanded, layers));
    throw new BrandConfigError([...new Set(lines)], [editRemedy(label)]);
  }
  return { brand: toBrand(parsed.data, slug), siteContent: toSiteContent(parsed.data) };
}
