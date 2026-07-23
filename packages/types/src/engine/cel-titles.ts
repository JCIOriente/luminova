// Public-safe CEL cargo labels, in statutory order, for unauthenticated surfaces
// (the public site) and for the boardShowcase rank. Kept as a standalone literal —
// NOT derived from CEL_POSITIONS — so the RBAC `grants` taxonomy never gets pulled
// into the public bundle. Lives under /engine (zod-free) so beacon can rank by it.
// A test in cel-positions.test.ts guards this list against drift from CEL_POSITIONS.
export const CEL_POSITION_TITLES: readonly string[] = [
  "Presidente",
  "Vicepresidente Ejecutivo",
  "Vicepresidente de Área",
  "Secretario",
  "Tesorero",
  "Asesor Legal",
  "Pasado Presidente",
  "Asesor Presidencial",
];
