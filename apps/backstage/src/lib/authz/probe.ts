import { subject, type Action, type AppAbility, type Subject } from "@luminova/auth/ability";

/** The fields of the document being asked about. `{}` (the default everywhere) asks the
 *  COLLECTION-level question. */
export type SubjectFields = Record<string, unknown>;

/** The ONE way this app asks the ability a question — never `ability.can(action, "Member")`.
 *
 *  A bare subject TYPE makes CASL answer "does any rule for this subject exist?", which a
 *  conditional grant satisfies: every plain Member holds `can('update','Member',{uid})`, so
 *  the type-level question said yes for EVERY member row and the UI offered Editar /
 *  Desactivar / Desafiliar that firestore.rules then denied. An empty subject INSTANCE
 *  matches only UNCONDITIONAL grants — the same thing the rules' unscoped `canDo(...)` allow
 *  means — and `on` asks the honest per-document question. Same reasoning as the nav gate
 *  (`components/nav-config.ts`), which this generalizes to every component gate.
 *
 *  `on` is copied, not tagged: `subject()` brands the object it is handed, and branding a
 *  cached Firestore doc would leak CASL metadata into app state. */
export function abilityAllows(
  ability: AppAbility,
  action: Action,
  sub: Subject,
  on?: SubjectFields,
): boolean {
  return ability.can(action, subject(sub, { ...on }));
}
