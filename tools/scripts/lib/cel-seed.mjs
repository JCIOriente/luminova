// Data mirror of CEL_POSITIONS in @luminova/types (packages/types/src/cel-positions.ts)
// — the canonical source of truth (apps/backstage/.../cel-seed.ts just re-exports it).
// `.mjs` ops scripts cannot import the workspace TS, so the fixed CEL catalog is duplicated
// here as plain data. Kept in sync by packages/types/src/cel-seed.mirror.test.ts.
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
    grants: ["Secretary", "Membership"],
    term: null,
    description: "Actas, comunicación del capítulo y gestión de miembros.",
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

// Mirror of toPositionCreateDoc in position-mapper.ts — must normalize the optional
// override/sigla to null (Firestore rejects undefined), or seeded CEL docs would lack
// the `sigla` field that app-created positions carry as null.
export function toPositionDoc(entry) {
  return {
    ...entry,
    titleFemale: entry.titleFemale ?? null,
    sigla: entry.sigla ?? null,
    active: true,
    deletedAt: null,
  };
}
