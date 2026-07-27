import type { Member } from "@luminova/types";
import { joinYear } from "./member-display";

const HEADER = ["Nombre", "Correo", "Cargo", "Estado", "Desde", "Puntos"];

// No leading-formula guard (=, +, -, @) on purpose: a member name cannot represent one. The
// name always starts with a letter (MEMBER_NAME_PATTERN in @luminova/types), and that is
// enforced in firestore.rules by memberNameValid() on EVERY write lane — self-service,
// institutional and create — not just by this app's zod, so it holds against a direct
// authenticated write too. Quote/comma escaping stays for the Cargo column, which comes
// from admin-authored positions.title and carries no such pattern.
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
