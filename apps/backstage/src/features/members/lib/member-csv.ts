import type { Member } from "@luminova/types";
import { joinYear } from "./member-display";

const HEADER = ["Nombre", "Correo", "Cargo", "Estado", "Desde", "Puntos"];

// No leading-formula guard (=, +, -, @) on purpose: a member name cannot represent one —
// see MEMBER_NAME_PATTERN in @luminova/types, which always starts a name with a letter, and
// is why the name is validated at the source rather than escaped here. Quote/comma escaping
// stays for the Cargo column, which is admin-authored free text with no pattern.
function cell(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
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
