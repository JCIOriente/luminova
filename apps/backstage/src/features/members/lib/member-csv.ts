import type { Member } from "@luminova/types";
import { joinYear } from "./member-display";

const HEADER = ["Nombre", "Correo", "Cargo", "Estado", "Desde", "Puntos"];

// Spreadsheet apps evaluate a cell starting with = + - or @ as a formula, so a crafted value
// becomes code on open. Escaping belongs HERE, at the output boundary, not in the field
// validators: memberNameValid() bounds Nombre going forward, but it cannot cover names stored
// before that gate, and it says nothing about the other columns — Correo passes
// z.string().email() with a leading "-" ("-a@x.com"), and Cargo is unbounded positions.title.
// A leading apostrophe is the portable "treat as text" marker; it forces quoting, which is
// why the formula branch escapes quotes too.
const FORMULA_PREFIX = /^[=+\-@]/;

function cell(value: string | number): string {
  // Numbers are never formulas, and quoting one would turn a numeric column into text in the
  // spreadsheet — Puntos must stay sortable.
  if (typeof value === "number") return String(value);
  // trimStart before testing: importers that strip leading whitespace (LibreOffice, most ETL)
  // would otherwise evaluate " =cmd|..." — positions.title has no .trim() on it. Leading tabs
  // and CRs are covered by the same trim, which is why they are not in FORMULA_PREFIX.
  if (FORMULA_PREFIX.test(value.trimStart())) return `"'${value.replace(/"/g, '""')}"`;
  // \r as well as \n: importers treat a lone CR in an UNQUOTED field as a record terminator,
  // so an embedded one splits the row and the text after it never passes through cell() —
  // it would land unescaped at the start of a new record.
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function membersToCsv(members: Member[], roleLabel: (m: Member) => string): string {
  const rows = members.map((m) =>
    [m.name, m.email, roleLabel(m), m.status, joinYear(m.joinDate), m.totalPoints]
      .map(cell)
      .join(","),
  );
  return [HEADER.join(","), ...rows].join("\n");
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
