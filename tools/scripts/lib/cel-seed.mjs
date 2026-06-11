// Data mirror of apps/backstage/src/features/positions/lib/cel-seed.ts (the TS
// source of truth — keep in sync). `.mjs` ops scripts cannot import the TS, so
// the fixed CEL catalog is duplicated here as plain data. CEL cargos are stable.
export const CEL_SEED = [
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

// Mirror of toPositionCreateDoc in position-mapper.ts.
export function toPositionDoc(entry) {
  return { ...entry, active: true, deletedAt: null };
}
