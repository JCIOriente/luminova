import type { Member } from "@luminova/types";
import { joinYear } from "./member-display";

const HEADER = ["Nombre", "Correo", "Rol", "Estado", "Desde", "Puntos"];

function cell(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function membersToCsv(members: Member[]): string {
  const rows = members.map((m) =>
    [m.name, m.email, m.role, m.status, joinYear(m.joinDate), m.totalPoints].map(cell).join(","),
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
