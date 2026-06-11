import type { Timestamp } from "firebase/firestore";
import { positionTitle, type Member, type MemberGender } from "@luminova/types";

const PALETTE = [
  "#1F4789",
  "#2563EB",
  "#0E7490",
  "#7C3AED",
  "#BE185D",
  "#B45309",
  "#15803D",
  "#9333EA",
  "#0F766E",
  "#C2410C",
];

export function avatarColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length] ?? "#1F4789";
}

export function joinYear(joinDate: Timestamp): number {
  return joinDate.toDate().getUTCFullYear();
}

type LabelSource = {
  gender?: MemberGender;
  positions?: Member["positions"];
};

export function memberPositionLabel(
  member: LabelSource,
  positionsById: Map<string, { title: string; titleFemale?: string | null }>,
  termKey: string,
): string {
  const cargoId = member.positions?.[termKey]?.cargoId;
  const cargo = cargoId ? positionsById.get(cargoId) : undefined;
  return cargo ? positionTitle(cargo, member.gender) : "Miembro";
}

type GenderedAction = "deactivated" | "reactivated" | "disaffiliated" | "deleted" | "created";
type FlatAction = "saved" | "invited";
export type MemberAction = GenderedAction | FlatAction;

const GENDERED: Record<GenderedAction, [fem: string, masc: string]> = {
  deactivated: ["desactivada", "desactivado"],
  reactivated: ["reactivada", "reactivado"],
  disaffiliated: ["desafiliada", "desafiliado"],
  deleted: ["eliminada", "eliminado"],
  created: ["agregada", "agregado"],
};

function isFeminine(fullName: string): boolean {
  const first = fullName.trim().split(/\s+/)[0] ?? "";
  return first.toLowerCase().endsWith("a");
}

export function actionMessage(name: string, action: MemberAction): string {
  if (action === "saved") return `Se guardaron los cambios de ${name}`;
  if (action === "invited") return `Invitación enviada a ${name}`;
  const [fem, masc] = GENDERED[action];
  return `${name} fue ${isFeminine(name) ? fem : masc}`;
}
