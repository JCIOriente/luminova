import type { InitiativeKind } from "@luminova/types";

export type InitiativeType = "program" | "project";
export type InitiativeCollection = "programs" | "projects";

/**
 * Single source of truth reconciling the three vocabularies for an initiative kind:
 * - `type`       — the URL/route param and UI vocabulary ("program" | "project")
 * - `kind`       — the domain label + CASL subject ("Program" | "Project")
 * - `collection` — the Firestore collection + query-key namespace ("programs" | "projects")
 */
export interface InitiativeKindConfig {
  type: InitiativeType;
  kind: InitiativeKind;
  collection: InitiativeCollection;
}

export const INITIATIVE_CONFIG: Record<InitiativeType, InitiativeKindConfig> = {
  program: { type: "program", kind: "Program", collection: "programs" },
  project: { type: "project", kind: "Project", collection: "projects" },
};

export const INITIATIVE_TYPE: Record<InitiativeKind, InitiativeType> = {
  Program: "program",
  Project: "project",
};
