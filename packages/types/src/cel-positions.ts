import type { Position } from "./position.js";

export type CelPositionSeed = Omit<Position, "id" | "deletedAt" | "active" | "term" | "titleFemale" | "sigla"> & {
  term: number | null;
  titleFemale?: string;
  sigla?: string;
};

export const CEL_POSITIONS: CelPositionSeed[] = [
  {
    title: "Presidente",
    titleFemale: "Presidenta",
    category: "CEL",
    grants: ["Admin"],
    term: null,
    description: "Dirige el capítulo; acceso total a la plataforma.",
  },
  {
    title: "Vicepresidente Ejecutivo",
    titleFemale: "Vicepresidenta Ejecutiva",
    category: "CEL",
    grants: ["ExecutiveCommittee", "Membership"],
    term: null,
    description: "Coordina la junta directiva y la membresía.",
  },
  {
    title: "Vicepresidente de Área",
    titleFemale: "Vicepresidenta de Área",
    category: "CEL",
    grants: ["ExecutiveCommittee", "Membership"],
    term: null,
    description: "Supervisa las direcciones de su área.",
  },
  {
    title: "Secretario",
    titleFemale: "Secretaria",
    category: "CEL",
    grants: ["Membership"],
    term: null,
    description: "Actas, registros y gestión de miembros.",
  },
  {
    title: "Tesorero",
    titleFemale: "Tesorera",
    category: "CEL",
    grants: ["Treasury"],
    term: null,
    description: "Finanzas, cuotas y pagos del capítulo.",
  },
  {
    title: "Asesor Legal",
    titleFemale: "Asesora Legal",
    category: "CEL",
    grants: ["ExecutiveCommittee"],
    term: null,
    description: "Asesora legalmente al comité ejecutivo.",
  },
  {
    title: "Pasado Presidente",
    titleFemale: "Pasada Presidenta",
    category: "CEL",
    grants: ["ExecutiveCommittee"],
    term: null,
    description: "Acompaña la transición y asesora a la directiva.",
  },
  {
    title: "Asesor Presidencial",
    titleFemale: "Asesora Presidencial",
    category: "CEL",
    grants: ["ExecutiveCommittee"],
    term: null,
    description: "Asesora a la presidencia.",
  },
];
