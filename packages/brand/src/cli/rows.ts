import { formatRemedies, uniqueRemedies, type Remedy } from "../remedy.ts";
import { columnWidths, formatBox, plural, terminalWidth } from "./table.ts";

/** One line of a `brand:check` section. */
export interface CheckRow {
  check: string;
  status: "ok" | "warn" | "fail" | "skip";
  detail: string;
  remedies?: readonly Remedy[];
}

export interface Section {
  title: string;
  rows: CheckRow[];
}

/** What a reader sees for each row id; anything else (an image's path) shows as it is. */
export const ROW_LABELS: Readonly<Record<string, string>> = {
  node: "Node.js",
  java: "Java",
  firebase: "Firebase CLI",
  selection: "Brand in use",
  profile: "Brand folder",
  ".firebaserc": "Firebase link",
  "example values": "Example values",
  images: "Images",
  "going live": "Not checked yet",
  "CD identity": "Deploy sign-in",
  gh: "GitHub CLI",
  "gh account": "GitHub account",
  gcloud: "Google Cloud CLI",
  "gcloud account": "Google Cloud account",
  "gcloud ADC": "Google Cloud app login",
  "firebase account": "Firebase account",
  bucket: "Brand storage",
};

const STATUS_LABELS: Readonly<Record<CheckRow["status"], string>> = {
  ok: "✓ OK",
  warn: "! Note",
  fail: "✗ Problem",
  skip: "- Skipped",
};

/** One table per section, its title heading the first column; columns line up across them. */
export function formatSections(sections: readonly Section[], maxWidth = terminalWidth()): string {
  const tables = sections.map(({ title, rows }) => [
    [title, "Status", "Details"],
    ...rows.map(({ check, status, detail }) => [
      ROW_LABELS[check] ?? check,
      STATUS_LABELS[status],
      detail,
    ]),
  ]);
  const widths = columnWidths(tables.flat(), maxWidth);
  return tables.map((table) => formatBox(table, widths)).join("\n\n");
}

const row =
  (status: CheckRow["status"]) =>
  (check: string, detail: string, remedies?: readonly Remedy[]): CheckRow => ({
    check,
    status,
    detail,
    remedies,
  });

export const ok = row("ok");
export const warn = row("warn");
export const fail = row("fail");
export const skip = row("skip");

const countOf = (sections: readonly Section[], status: CheckRow["status"]) =>
  sections.flatMap(({ rows }) => rows).filter((row) => row.status === status).length;

/** The one line that answers "am I all right?". */
export function verdict(sections: readonly Section[]): string {
  const failures = countOf(sections, "fail");
  if (failures > 0) return `✗ ${plural(failures, "problem")} to fix`;
  const notes = countOf(sections, "warn");
  if (notes > 0) return `✓ No problems, ${plural(notes, "note")} worth a look`;
  return countOf(sections, "skip") > 0
    ? "✓ No problems so far; some checks wait for going live"
    : "✓ Everything is ready";
}

/**
 * Sections, then one block of remedies for them, and how many rows failed: what brand:check
 * prints, and brand:push for its images.
 */
export function formatReport(
  sections: readonly Section[],
  maxWidth = terminalWidth(),
): { text: string; failures: number } {
  const rows = sections.flatMap((section) => section.rows);
  const failures = countOf(sections, "fail");
  const fix = formatRemedies(rowRemedies(rows), failures > 0 ? "To fix:" : "Worth a look:");
  return {
    text: [formatSections(sections, maxWidth), fix].filter(Boolean).join("\n\n"),
    failures,
  };
}

/** The remedies of failing and warning rows, each once, in row (fix) order. */
export const rowRemedies = (rows: readonly CheckRow[]): Remedy[] =>
  uniqueRemedies(
    rows
      .filter(({ status }) => status === "fail" || status === "warn")
      .flatMap(({ remedies }) => remedies ?? []),
  );
