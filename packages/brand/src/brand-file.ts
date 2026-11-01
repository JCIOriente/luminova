import { readFileSync } from "node:fs";
import { TomlError, parse } from "smol-toml";
import { BrandConfigError, errorMessage, issueLines } from "./errors.ts";
import type { Remedy } from "./remedy.ts";
import {
  CHAPTER_IDENTITY,
  RETIRED_KEYS,
  brandFileSchema,
  isTable,
  toBrand,
  type Brand,
  type Table,
} from "./schema.ts";
import { toSiteContent, type SiteContent } from "./site-content.ts";

export const BRAND_FILE = "brand.toml";

/** Line 1 of a brand.toml: Taplo and Even Better TOML read it for hover help and completion. */
export const SCHEMA_LINE = "#:schema ../brand.schema.json";

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
 * What no chapter inherits from the example: the identity (a chapter names its own, or the
 * schema says it is required) and the web apps, which belong to the example's project.
 */
const NOT_INHERITED: readonly (readonly string[])[] = [
  ...CHAPTER_IDENTITY,
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

/**
 * Values the example sets that describe the example, not a chapter: a chapter inherits
 * them like any other, but the sites would then state the example's year, email and map.
 */
const EXAMPLE_SPECIFIC: readonly (readonly string[])[] = [
  ["foundedYear"],
  ["contact", "email"],
  ["backstage", "emailPlaceholder"],
  ["contact", "mapUrl"],
];

/** Where a chapter's own file leaves an example-specific value to the example. */
export const inheritedExampleValues = (chapter: Table): string[] =>
  EXAMPLE_SPECIFIC.filter((path) => valueAt(chapter, path) === undefined).map((path) =>
    tomlLocation(path, chapter),
  );

/** The example as a base layer: everything but its identity. */
export const baseLayer = (example: Table): Table => NOT_INHERITED.reduce(without, example);

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

export function valueAt(root: unknown, path: readonly PropertyKey[]): unknown {
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
    const lines = parsed.error.issues.flatMap((issue) =>
      issueLines(
        issue,
        (path) => `${ownerOf(layers, path)} ${tomlLocation(path, expanded)}`,
        RETIRED_KEYS,
      ),
    );
    // A retired key carries its own remedy; the generic edit is for the rest.
    const editable = lines.some((line) => typeof line === "string");
    throw new BrandConfigError([...new Set(lines)], editable ? [editRemedy(label)] : []);
  }
  return { brand: toBrand(parsed.data, slug), siteContent: toSiteContent(parsed.data) };
}
