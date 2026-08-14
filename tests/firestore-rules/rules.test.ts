import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
// Build claims with the REAL seed producer (not a local re-implementation), so every
// role-based context exercises the exact perms a seeded user receives → this whole suite
// is a "seed-output ⊨ firestore.rules" contract. The packages/types drift guard proves the
// .mjs mirror matches the canonical @luminova/types table.
import { permsForRoles } from "../../tools/scripts/lib/role-seed.mjs";
import { parseActivityLockedFields } from "../../tools/scripts/lib/rules-locked-fields.mjs";
import { parseDeleteDeniedCollections } from "../../tools/scripts/lib/rules-delete-denied.mjs";

let env: RulesTestEnvironment;

/** Authenticated context. `perms` defaults to the built-in roles' effective set;
 *  pass an explicit array to simulate a custom role / override grant. */
function as(uid: string, roles: string[], perms?: string[]) {
  return env.authenticatedContext(uid, { roles, perms: perms ?? permsForRoles(roles) }).firestore();
}
function anon() {
  return env.unauthenticatedContext().firestore();
}

const MEMBER_DOC = { name: "Ana", totalPoints: 0, uid: "owner-uid", active: true, deletedAt: null };

/** The birth state every members/positions/allies create arm now requires (B2): born
 *  live, with an explicit null deletedAt. Spread into a create payload whose test is
 *  about something ELSE, so it keeps failing (or succeeding) for its own reason rather
 *  than for the missing lifecycle pair — the tautological-test class this repo has
 *  already had to clean up once. */
const BORN_LIVE = { active: true, deletedAt: null };

// Rules derive the term from request.time.year() (UTC); compute it from the client
// clock so this suite can't rot when the calendar year rolls over.
const TERM = String(new Date().getUTCFullYear());
const DELETED_AT = new Date("2026-01-01T00:00:00Z");
// Fixed instant for the activity-lock fixtures so echo-update tests can resend
// the exact same startAt value.
const LOCK_TS = new Date("2026-06-10T18:00:00Z");

const RULES_SOURCE = readFileSync(
  resolve(fileURLToPath(new URL("../../firestore.rules", import.meta.url))),
  "utf8",
);

/** Field names the rules' activityLockSafe() gate marks unchanged() — parsed from the
 *  real rules source so the deny-probe loop below can never lag the rules it protects.
 *  packages/types/src/activity-locked-fields.rules.test.ts cross-checks this exact set
 *  against the canonical ACTIVITY_LOCKED_FIELDS (the client guard derives from the same). */
const RULES_LOCKED_FIELDS = parseActivityLockedFields(RULES_SOURCE);

/** One drift value per locked field (must differ from the act_locked fixture). Keyed so a
 *  new rules-locked field with no probe here trips the parity assertion below. */
const LOCKED_FIELD_DRIFT: Record<string, unknown> = {
  category: "Course",
  startAt: new Date("2026-06-11T18:00:00Z"),
  parentId: "p_dir",
  parentType: "Project",
  termId: "2027",
};

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-rules-test",
    firestore: {
      host: "127.0.0.1",
      port: Number(process.env.FIRESTORE_EMULATOR_PORT ?? 4010),
      rules: RULES_SOURCE,
    },
  });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "members/m1"), MEMBER_DOC);
    await setDoc(doc(db, "members/m_deleted"), {
      name: "Bea",
      totalPoints: 0,
      uid: "bea-uid",
      active: false,
      deletedAt: DELETED_AT,
    });
    await setDoc(doc(db, "allies/a1"), { companyName: "ACME", active: true, deletedAt: null });
    await setDoc(doc(db, "pointRules/r1"), { points: 10 });
    await setDoc(doc(db, "roles/Admin"), {
      name: "Administrador",
      description: "",
      builtIn: true,
      builtInKey: "Admin",
      permissions: ["manage:all"],
      locked: true,
      active: true,
      deletedAt: null,
    });
    await setDoc(doc(db, "roles/Treasury"), {
      name: "Tesorería",
      description: "",
      builtIn: true,
      builtInKey: "Treasury",
      permissions: ["read:Member", "read:MemberPoints"],
      locked: false,
      active: true,
      deletedAt: null,
    });
    await setDoc(doc(db, "roles/custom_existing"), {
      name: "Coordinador",
      description: "",
      builtIn: false,
      builtInKey: null,
      permissions: ["read:Position"],
      locked: false,
      active: true,
      deletedAt: null,
    });
    // Lifecycle fixtures. Deliberately NOT roles/Treasury — the roles describe block
    // mutates that doc, and a lifecycle test sharing it would couple to test order.
    await setDoc(doc(db, "roles/Membership"), {
      name: "Membresía",
      description: "",
      builtIn: true,
      builtInKey: "Membership",
      permissions: ["manage:Member"],
      locked: false,
      active: true,
      deletedAt: null,
    });
    await setDoc(doc(db, "roles/Member"), {
      name: "Miembro",
      description: "",
      builtIn: true,
      builtInKey: "Member",
      permissions: ["read:Member"],
      locked: false,
      active: true,
      deletedAt: null,
    });
    await setDoc(doc(db, "roles/inactive_builtin"), {
      name: "Secretaría",
      description: "",
      builtIn: true,
      builtInKey: "Secretary",
      permissions: ["manage:Notification"],
      locked: false,
      active: false,
      deletedAt: DELETED_AT,
    });
    // Deny-probe target for the malformed-lifecycle writes below. Every test that uses
    // it is an assertFails, so its state never changes and it can serve all of them.
    await setDoc(doc(db, "roles/ghost_probe"), {
      name: "Sonda",
      description: "",
      builtIn: false,
      builtInKey: null,
      permissions: ["read:Position"],
      locked: false,
      active: true,
      deletedAt: null,
    });
    // An inactive role whose permissions stay editable (Design 4: the stored array is
    // real, editable, and is exactly what "Reactivar rol" mints to every holder).
    await setDoc(doc(db, "roles/inactive_editable"), {
      name: "Sonda inactiva",
      description: "",
      builtIn: false,
      builtInKey: null,
      permissions: ["read:Position"],
      locked: false,
      active: false,
      deletedAt: DELETED_AT,
    });
    // Anti-lockout probe: a built-in Admin doc whose `locked` is FALSE — exactly the prod
    // shape docs/specs/role-lifecycle.md warns about (prod role docs lag the seed). With
    // `locked` false the locked guard does not bite, so a deny here can only be
    // roleDeactivationAllowed()'s Admin arm. Deactivation is deny-only, so the doc's
    // lifecycle state never changes; the non-vacuity twin edits `permissions`, a disjoint
    // field, which is why one doc can serve both.
    await setDoc(doc(db, "roles/admin_unlocked"), {
      name: "Administrador (sin locked)",
      description: "",
      builtIn: true,
      builtInKey: "Admin",
      permissions: ["manage:all"],
      locked: false,
      active: true,
      deletedAt: null,
    });
    await setDoc(doc(db, "terms/2026"), { status: "Activo" });
    await setDoc(doc(db, "activities/act1"), { termId: "2026", category: "Assembly" });
    await setDoc(doc(db, "activities/act_dir"), {
      termId: "2026",
      category: "ProjectExecution",
      parentType: "Project",
      parentId: "p_dir",
      title: "Actividad del Proyecto Eco",
    });
    await setDoc(doc(db, "activities/act_standalone"), {
      termId: "2026",
      category: "Assembly",
      parentType: null,
      parentId: null,
      title: "Actividad sin parent",
    });
    const inWindow = new Date();
    const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000);
    await setDoc(doc(db, "activities/a1"), {
      termId: "2026",
      category: "Assembly",
      parentType: null,
      parentId: null,
      startAt: inWindow,
      status: "Programada",
    });
    await setDoc(doc(db, "activities/act_old"), {
      termId: "2026",
      category: "Assembly",
      parentType: null,
      parentId: null,
      startAt: twoDaysAgo,
      status: "Programada",
    });
    await setDoc(doc(db, "activities/act_old_cancel"), {
      termId: "2026",
      category: "Assembly",
      parentType: null,
      parentId: null,
      startAt: twoDaysAgo,
      status: "Cancelada",
    });
    await setDoc(doc(db, "projects/p_closed"), {
      termId: "2026",
      title: "Cerrado",
      status: "Finalizado",
    });
    await setDoc(doc(db, "activities/act_old_closed_parent"), {
      termId: "2026",
      category: "ProjectExecution",
      parentType: "Project",
      parentId: "p_closed",
      startAt: twoDaysAgo,
      status: "Programada",
    });
    await setDoc(doc(db, "activities/act_closed_parent"), {
      termId: "2026",
      category: "ProjectExecution",
      parentType: "Project",
      parentId: "p_closed",
      startAt: inWindow,
      status: "Programada",
    });
    await setDoc(doc(db, "activities/act_cancel"), {
      termId: "2026",
      category: "Assembly",
      parentType: null,
      parentId: null,
      startAt: inWindow,
      status: "Cancelada",
    });
    await setDoc(doc(db, "activities/act_badparent"), {
      termId: "2026",
      category: "ProjectExecution",
      parentType: "Committee",
      parentId: "p_closed",
      startAt: inWindow,
      status: "Programada",
    });
    // Activity-lock fixtures: hasCheckIns is beacon-maintained; true locks
    // category/startAt/parentId/parentType against every client writer.
    await setDoc(doc(db, "activities/act_locked"), {
      termId: "2026",
      category: "Assembly",
      parentType: null,
      parentId: null,
      title: "Bloqueada",
      startAt: LOCK_TS,
      status: "Programada",
      hasCheckIns: true,
    });
    await setDoc(doc(db, "activities/act_unlocked_flag"), {
      termId: "2026",
      category: "Assembly",
      parentType: null,
      parentId: null,
      title: "Libre",
      startAt: LOCK_TS,
      status: "Programada",
      hasCheckIns: false,
    });
    await setDoc(doc(db, "activities/act_dir_locked"), {
      termId: "2026",
      category: "ProjectExecution",
      parentType: "Project",
      parentId: "p_dir",
      title: "Actividad bloqueada del Eco",
      startAt: LOCK_TS,
      status: "Programada",
      hasCheckIns: true,
    });
    await setDoc(doc(db, "checkIns/c1"), { memberId: "m1", activityId: "a1", role: "Attendee" });
    await setDoc(doc(db, "checkIns/c_del_admin"), {
      memberId: "m1",
      activityId: "a1",
      role: "Attendee",
    });
    await setDoc(doc(db, "checkIns/c_del_scan"), {
      memberId: "m1",
      activityId: "a1",
      role: "Attendee",
    });
    await setDoc(doc(db, "checkIns/c_del_old"), {
      memberId: "m1",
      activityId: "act_old",
      role: "Attendee",
    });
    await setDoc(doc(db, "checkIns/c_del_director"), {
      memberId: "m1",
      activityId: "a1",
      role: "Director",
    });
    await setDoc(doc(db, "checkIns/c_del_old_admin"), {
      memberId: "m1",
      activityId: "act_old",
      role: "Attendee",
    });
    await setDoc(doc(db, "checkIns/c_del_cancel"), {
      memberId: "m1",
      activityId: "act_cancel",
      role: "Attendee",
    });
    await setDoc(doc(db, "checkIns/c_del_closed"), {
      memberId: "m1",
      activityId: "act_closed_parent",
      role: "Attendee",
    });
    await setDoc(doc(db, "participations/part1"), { memberId: "m1", termId: "2026" });
    await setDoc(doc(db, "projects/p1"), { title: "P" });
    await setDoc(doc(db, "programs/prog1"), { termId: "2026", title: "Programa X" });
    await setDoc(doc(db, "projects/p_dir"), {
      termId: "2026",
      title: "Eco",
      roster: { directorId: "m1", coDirectorIds: [], teamIds: [] },
      directionUids: ["owner-uid"],
      finalReport: null,
      impact: null,
      status: "EnEjecucion",
    });
    await setDoc(doc(db, "projects/p_done"), {
      termId: "2026",
      title: "Done",
      roster: { directorId: "m1", coDirectorIds: [], teamIds: [] },
      directionUids: ["owner-uid"],
      finalReport: { filedAt: new Date("2026-05-01T00:00:00Z"), filedBy: "owner-uid" },
      impact: { personsImpacted: 1, volunteers: 1, custom: [], closingSummary: "x" },
      status: "Finalizado",
    });
    await setDoc(doc(db, "programs/prog_dir"), {
      termId: "2026",
      title: "Eco Prog",
      roster: { directorId: "m1", coDirectorIds: [], teamIds: [] },
      directionUids: ["owner-uid"],
      finalReport: null,
      impact: null,
      status: "EnEjecucion",
    });
    // Pristine pending fixtures dedicated to the completion-SUCCESS tests, which mutate
    // their target (status -> Finalizado). Keeping them separate leaves p_dir/prog_dir
    // pristine for the deny tests regardless of run order (suite seeds once, no reset).
    await setDoc(doc(db, "projects/p_complete"), {
      termId: "2026",
      title: "Por cerrar (direction)",
      roster: { directorId: "m1", coDirectorIds: [], teamIds: [] },
      directionUids: ["owner-uid"],
      finalReport: null,
      impact: null,
      status: "EnEjecucion",
    });
    await setDoc(doc(db, "projects/p_pm"), {
      termId: "2026",
      title: "Por cerrar (PM)",
      roster: { directorId: "m1", coDirectorIds: [], teamIds: [] },
      directionUids: [],
      finalReport: null,
      impact: null,
      status: "EnEjecucion",
    });
    // Dedicated targets for the featured-flag SUCCESS tests, which persist featured:true.
    // Kept separate so p_dir stays pristine (featured absent) for the deny test —
    // the suite seeds once with no per-test reset.
    await setDoc(doc(db, "projects/p_feat"), {
      termId: "2026",
      title: "Destacable (admin)",
      roster: { directorId: "m1", coDirectorIds: [], teamIds: [] },
      directionUids: ["owner-uid"],
      finalReport: null,
      impact: null,
      status: "EnEjecucion",
    });
    await setDoc(doc(db, "programs/prog_feat"), {
      termId: "2026",
      title: "Destacable (PM)",
      roster: { directorId: "m1", coDirectorIds: [], teamIds: [] },
      directionUids: ["owner-uid"],
      finalReport: null,
      impact: null,
      status: "EnEjecucion",
    });
    // Targets for the perm-keyed curation describe. Each absorbs a featured:true
    // success, so they are separate docs (the suite seeds once, no per-test reset)
    // and separate from each other so neither success can mask the other.
    await setDoc(doc(db, "projects/p_feat_showcase"), {
      termId: "2026",
      title: "Destacable (update:Showcase)",
      roster: { directorId: "m1", coDirectorIds: [], teamIds: [] },
      directionUids: ["owner-uid"],
      finalReport: null,
      impact: null,
      status: "EnEjecucion",
    });
    await setDoc(doc(db, "projects/p_feat_admin_role"), {
      termId: "2026",
      title: "Destacable (Admin sin perms)",
      roster: { directorId: "m1", coDirectorIds: [], teamIds: [] },
      directionUids: ["owner-uid"],
      finalReport: null,
      impact: null,
      status: "EnEjecucion",
    });
    // ONE pristine (featured absent) target per curation DENY test. They must not share a
    // doc: if any deny regresses, its write persists featured:true and every later deny on
    // the same doc turns vacuous — it would then pass as an unchanged echo rather than as a
    // real denial. Measured, not theorised: with a shared doc the manage:all and
    // manage:Showcase denials both passed against the OLD role-keyed gate.
    for (const id of ["p_feat_deny_stale", "p_feat_deny_mgrall", "p_feat_deny_inert"]) {
      await setDoc(doc(db, `projects/${id}`), {
        termId: "2026",
        title: "No destacable",
        roster: { directorId: "m1", coDirectorIds: [], teamIds: [] },
        directionUids: [],
        finalReport: null,
        impact: null,
        status: "EnEjecucion",
      });
    }
    // Finalized targets for the featured quick-toggle (curation happens after
    // completion). finalReport + impact are non-null so a featured-only write
    // survives finalizedRequiresReport() / initiativeWriteSafe(). Two docs, like
    // p_feat/p_dir: p_final_ok absorbs the Admin success (persists featured:true),
    // p_final_dir stays pristine (featured:false) so the direction-deny is real —
    // the suite seeds once with no per-test reset.
    const finalReport = { filedAt: new Date("2026-05-01T00:00:00Z"), filedBy: "owner-uid" };
    const impact = { personsImpacted: 1, volunteers: 1, custom: [], closingSummary: "x" };
    await setDoc(doc(db, "projects/p_final_ok"), {
      termId: "2026",
      title: "Finalizado destacable",
      roster: { directorId: "m1", coDirectorIds: [], teamIds: [] },
      directionUids: ["owner-uid"],
      finalReport,
      impact,
      status: "Finalizado",
      featured: false,
    });
    await setDoc(doc(db, "projects/p_final_dir"), {
      termId: "2026",
      title: "Finalizado (dir)",
      roster: { directorId: "m1", coDirectorIds: [], teamIds: [] },
      directionUids: ["owner-uid"],
      finalReport,
      impact,
      status: "Finalizado",
      featured: false,
    });
    await setDoc(doc(db, "memberPoints/2025/03/e1"), { points: 5 });
    await setDoc(doc(db, "positions/pos1"), {
      title: "Tesorero",
      titleFemale: "Tesorera",
      category: "CEL",
      grants: ["Treasury"],
      term: null,
      description: "Finanzas.",
      active: true,
      deletedAt: null,
    });
    await setDoc(doc(db, "positions/pos_deleted"), {
      title: "Tesorero",
      titleFemale: "Tesorera",
      category: "CEL",
      grants: ["Treasury"],
      term: null,
      description: "Finanzas.",
      active: false,
      deletedAt: DELETED_AT,
    });
    await setDoc(doc(db, "members/m_positions"), {
      name: "Carlos",
      totalPoints: 0,
      uid: "carlos-uid",
      active: true,
      deletedAt: null,
    });
    // An un-invited member: NO uid field (the common case — only invited members
    // get a uid). Exercises the absent-field path in unchanged()/self-edit rules.
    await setDoc(doc(db, "members/m_nouid"), {
      name: "Dora",
      totalPoints: 0,
      active: true,
      deletedAt: null,
    });
    // Pre-format artifact: a phone stored before the 8-digit rule existed. The self
    // lane must still let this member change their PHOTO — validating untouched fields
    // would lock legacy members out of their own profile.
    await setDoc(doc(db, "members/m_legacyphone"), {
      name: "Eva",
      totalPoints: 0,
      uid: "eva-uid",
      phone: "+591 700-112",
      active: true,
      deletedAt: null,
    });
    // Pre-format artifact: a name stored before memberNameValid() existed. An admin
    // editing any OTHER field on this member must not be denied by it — touched('name')
    // gates on the diff, so an unchanged legacy name is never re-validated.
    await setDoc(doc(db, "members/m_legacyname"), {
      name: "Ana Rivas 2",
      totalPoints: 0,
      uid: "legacyname-uid",
      active: true,
      deletedAt: null,
    });
    // A member who ALREADY holds a power cargo. The C1 hole: nothing in
    // positionsAssignmentSafe() looked at the cargo being REPLACED, so a manage:Member
    // holder could overwrite this with a grant-free cargo and claims-sync would compute
    // grants.length === 0 — silently stripping the Admin claim.
    await setDoc(doc(db, "members/m_powercargo"), {
      name: "Franco",
      totalPoints: 0,
      uid: "franco-uid",
      active: true,
      deletedAt: null,
      positions: { [TERM]: { cargoId: "pos1", comisionIds: [], assignedBy: "admin-uid" } },
    });
    // Pre-invariant artifact: a Comision doc carrying grants (was creatable by
    // Admin before comisionGrantsEmpty). Exercises the deliberate lockout.
    await setDoc(doc(db, "positions/com_legacy_power"), {
      title: "Comité Legado",
      sigla: "CL",
      category: "Comision",
      grants: ["Membership"],
      term: null,
      description: "Pre-invariante.",
      active: true,
      deletedAt: null,
    });
    // The members-positions lane's own principal (perms-only `update:Position`, no built-in
    // role) has a member record of its own — the accepted-exposure test assigns a grant-free
    // JDL board cargo to THIS doc, i.e. to itself.
    await setDoc(doc(db, "members/m_orgchart"), {
      name: "Gabriela",
      totalPoints: 0,
      uid: "orgchart-uid",
      active: true,
      deletedAt: null,
    });
    // Category-mutation target for the positions catalog arm. Its own doc so the Admin
    // success case cannot disturb pos1/pos_soft, which half this suite reads.
    await setDoc(doc(db, "positions/pos_cat"), {
      title: "Director de Membresía",
      titleFemale: "Directora de Membresía",
      category: "JDL",
      grants: [],
      term: 2026,
      description: "Dirección de membresía.",
      active: true,
      deletedAt: null,
    });
    // Malformed soft-delete state, seeded through the admin SDK because no client arm can
    // produce it any more (B2). These are the legacy shapes B1's well-formedness prefix
    // moves from client-editable to admin-SDK-only — the whole reason owner-op 4 is a
    // blocking pre-deploy audit. m_badactive additionally carries publicProfile: true so
    // the Admin TAKEDOWN arm — the one arm that does not call softDeleteSafe() — can be
    // proven still open on it. That arm is the only rules-level remedy for these docs.
    await setDoc(doc(db, "members/m_badactive"), {
      name: "Hilda",
      totalPoints: 0,
      uid: "badactive-uid",
      publicProfile: true,
      active: "false",
      deletedAt: null,
    });
    await setDoc(doc(db, "members/m_noactive"), {
      name: "Irene",
      totalPoints: 0,
      deletedAt: null,
    });
    // active is a well-formed bool, so the self lane's own `active == true` check passes
    // and ('deletedAt' in d) is the only thing left to deny — isolation, not a pile-up.
    await setDoc(doc(db, "members/m_nodeletedat"), {
      name: "Julio",
      totalPoints: 0,
      uid: "nodeletedat-uid",
      active: true,
    });
    // Same shape as m_nodeletedat, its own doc: the repair-asymmetry test WRITES the missing
    // key, and sharing a fixture with the denial tests above would couple them to order.
    await setDoc(doc(db, "members/m_nodeletedat_fix"), {
      name: "Karina",
      totalPoints: 0,
      active: true,
    });
    await setDoc(doc(db, "positions/pos_badactive"), {
      title: "Vocal Suplente",
      titleFemale: "Vocal Suplente",
      category: "JDL",
      grants: [],
      term: 2026,
      description: "Malformado.",
      active: "false",
      deletedAt: null,
    });
    await setDoc(doc(db, "allies/a_badactive"), {
      companyName: "Malformada",
      active: "false",
      deletedAt: null,
    });
    await setDoc(doc(db, "positions/pos_soft"), {
      title: "Vocal",
      titleFemale: "Vocal",
      category: "JDL",
      grants: [],
      term: 2026,
      description: "Vocal del directorio.",
      active: true,
      deletedAt: null,
    });
    await setDoc(doc(db, "showcase/s1"), { id: "s1", kind: "Project", title: "Eco" });
    await setDoc(doc(db, "boardShowcase/b1"), {
      id: "b1",
      name: "Arnold Gandarillas",
      title: "Secretario",
      group: "CEL",
      portraitUrl: "https://cdn/x.jpg",
    });
    await setDoc(doc(db, "allyShowcase/a1"), {
      id: "a1",
      name: "Unifranz",
      logoUrl: "https://cdn/x.png",
      category: "University",
    });
    await setDoc(doc(db, "siteConfig/current"), { version: 1, stats: {}, allies: [] });
    // Lead fixtures (public contact-form capture). One per triage path so the
    // suite's single seed pass leaves each pristine for its own assertion.
    const LEAD_SEED = {
      name: "Prospecto",
      email: "prospecto@example.com",
      intent: "Membresía",
      message: "Quiero unirme a JCI Oriente.",
      status: "Nuevo",
      source: "web",
      createdAt: new Date("2026-07-01T00:00:00Z"),
      deletedAt: null,
    };
    await setDoc(doc(db, "leads/lead_new"), LEAD_SEED);
    await setDoc(doc(db, "leads/lead_triage"), LEAD_SEED);
    await setDoc(doc(db, "leads/lead_softdel"), LEAD_SEED);
    await setDoc(doc(db, "leads/lead_deleted"), {
      ...LEAD_SEED,
      status: "Cerrado",
      deletedAt: DELETED_AT,
    });
    // Notification fixtures. `notifications/n1` is the composed message (read gated
    // on read:Notification, no client update/delete); `members/m1/notifications/n1`
    // is m1's Admin-SDK-written inbox copy (owner reads + flips `read` only).
    await setDoc(doc(db, "notifications/n1"), {
      title: "Aviso",
      body: "Cuerpo",
      url: null,
      audience: { type: "everyone" },
      createdBy: "exec-uid",
      createdAt: new Date("2026-07-01T00:00:00Z"),
    });
    await setDoc(doc(db, "members/m1/notifications/n1"), {
      title: "Aviso",
      body: "Cuerpo",
      url: null,
      read: false,
      createdAt: new Date("2026-07-01T00:00:00Z"),
    });
  });
});

afterAll(async () => {
  await env.cleanup();
});

describe("firestore.rules — members", () => {
  it("denies anonymous reads", async () => {
    await assertFails(getDoc(doc(anon(), "members/m1")));
  });
  it("allows board roles to read", async () => {
    await assertSucceeds(getDoc(doc(as("u", ["ExecutiveCommittee"]), "members/m1")));
  });
  it("allows a member to read their own profile", async () => {
    await assertSucceeds(getDoc(doc(as("owner-uid", ["Member"]), "members/m1")));
  });
  it("allows a member to read another profile (Member holds read:Member — roster access)", async () => {
    await assertSucceeds(getDoc(doc(as("stranger", ["Member"]), "members/m1")));
  });
  it("allows Membership to create with totalPoints 0", async () => {
    await assertSucceeds(
      setDoc(doc(as("u", ["Membership"]), "members/new1"), {
        name: "Bruno Paz",
        totalPoints: 0,
        ...BORN_LIVE,
      }),
    );
  });
  it("denies create with publicProfile pre-set (consent is not institutionally stamped)", async () => {
    // The identical payload without publicProfile succeeds above — so this isolates
    // the create-arm !('publicProfile' in ...) guard, not some other missing field.
    // The org-wide default is stamped by beacon (admin SDK), never by a client.
    await assertFails(
      setDoc(doc(as("u", ["Membership"]), "members/new_consent"), {
        name: "Bruno Paz",
        totalPoints: 0,
        ...BORN_LIVE,
        publicProfile: true,
      }),
    );
  });
  it("denies create with publicProfile explicitly false (no client owns this key)", async () => {
    await assertFails(
      setDoc(doc(as("u", ["Membership"]), "members/new_consent_false"), {
        // "Bruno Paz", not "B": a one-character name is below memberNameValid()'s floor,
        // so the old payload was already denied for the NAME — the publicProfile guard
        // this test is named for never got to speak.
        name: "Bruno Paz",
        totalPoints: 0,
        ...BORN_LIVE,
        publicProfile: false,
      }),
    );
  });
  it("denies create with publicProfile null (an explicit null still counts as present)", async () => {
    await assertFails(
      setDoc(doc(as("u", ["Membership"]), "members/new_consent_null"), {
        name: "Bruno Paz",
        totalPoints: 0,
        ...BORN_LIVE,
        publicProfile: null,
      }),
    );
  });
  it("allows the production create payload shape (mirrors toMemberCreateDoc)", async () => {
    await assertSucceeds(
      setDoc(doc(as("u", ["Membership"]), "members/new_prod_shape"), {
        // A real name: the create arm now also runs memberNameValid (PR #214).
        name: "Beto Rojas",
        email: "b@jci.bo",
        gender: "Femenino",
        phone: "",
        profession: "",
        status: "Activo",
        joinDate: Timestamp.fromMillis(0),
        birthdate: Timestamp.fromMillis(0),
        // Keyed off the client clock, like TERM below: createPositionsSafe() resolves the
        // slot via request.time.year(), so a hardcoded year fails this suite in January.
        positions: {
          [String(new Date().getUTCFullYear())]: {
            cargoId: null,
            comisionIds: [],
            assignedBy: "u",
          },
        },
        profilePicture: null,
        totalPoints: 0,
        active: true,
        deletedAt: null,
      }),
    );
  });
  it("denies create when totalPoints != 0", async () => {
    await assertFails(
      setDoc(doc(as("u", ["Membership"]), "members/new2"), {
        name: "Bruno Paz",
        totalPoints: 5,
        ...BORN_LIVE,
      }),
    );
  });
  it("denies a non-admin/non-membership role from creating", async () => {
    await assertFails(
      setDoc(doc(as("u", ["Treasury"]), "members/new3"), {
        name: "Bruno Paz",
        totalPoints: 0,
        ...BORN_LIVE,
      }),
    );
  });
  it("BLOCKING: denies Membership creating with a forged assignedBy + power cargo (escalation on create)", async () => {
    await assertFails(
      setDoc(doc(as("mem-uid", ["Membership"]), "members/new_evil"), {
        name: "Evil",
        totalPoints: 0,
        ...BORN_LIVE,
        positions: { [TERM]: { cargoId: "pos1", comisionIds: [], assignedBy: "admin-victim-uid" } },
      }),
    );
  });
  it("denies setting uid on create (uid is admin-SDK only)", async () => {
    await assertFails(
      setDoc(doc(as("mem-uid", ["Membership"]), "members/new_uid"), {
        name: "Ximena Paz",
        totalPoints: 0,
        ...BORN_LIVE,
        uid: "mem-uid",
      }),
    );
  });
  it("denies Membership creating with a power cargo even when self-stamped", async () => {
    await assertFails(
      setDoc(doc(as("mem-uid", ["Membership"]), "members/new_pow"), {
        name: "Ximena Paz",
        totalPoints: 0,
        ...BORN_LIVE,
        positions: { [TERM]: { cargoId: "pos1", comisionIds: [], assignedBy: "mem-uid" } },
      }),
    );
  });
  it("allows Membership creating with self assignedBy + empty-grants cargo", async () => {
    await assertSucceeds(
      setDoc(doc(as("mem-uid", ["Membership"]), "members/new_ok"), {
        name: "Ximena Paz",
        totalPoints: 0,
        ...BORN_LIVE,
        positions: { [TERM]: { cargoId: "pos_soft", comisionIds: [], assignedBy: "mem-uid" } },
      }),
    );
  });
  it("allows Admin creating with a power cargo + self assignedBy", async () => {
    await assertSucceeds(
      setDoc(doc(as("admin-uid", ["Admin"]), "members/new_admin"), {
        name: "Ximena Paz",
        totalPoints: 0,
        ...BORN_LIVE,
        positions: { [TERM]: { cargoId: "pos1", comisionIds: [], assignedBy: "admin-uid" } },
      }),
    );
  });
  it("denies client mutation of totalPoints on update", async () => {
    await assertFails(updateDoc(doc(as("u", ["Membership"]), "members/m1"), { totalPoints: 99 }));
  });
  it("denies client mutation of uid on update", async () => {
    await assertFails(updateDoc(doc(as("u", ["Membership"]), "members/m1"), { uid: "hijack" }));
  });
  it("allows Membership to update a normal field", async () => {
    await assertSucceeds(
      updateDoc(doc(as("u", ["Membership"]), "members/m1"), { name: "Ana Rivas Paz" }),
    );
  });
  // memberNameValid() binds EVERY lane, not just the member's own: boardShowcase publishes
  // the name world-read, so the bound belongs at the trust boundary. Leaving it to the admin
  // form's client-side zod would make it bypassable by any direct authenticated write.
  it("denies Membership creating a member with a formula-shaped name", async () => {
    await assertFails(
      setDoc(doc(as("u", ["Membership"]), "members/new_formula"), {
        name: '=HYPERLINK("http://evil")',
        totalPoints: 0,
        ...BORN_LIVE,
      }),
    );
  });
  it("denies Membership creating a member with digits in the name", async () => {
    await assertFails(
      setDoc(doc(as("u", ["Membership"]), "members/new_digits"), {
        name: "Ana Rivas 2",
        totalPoints: 0,
        ...BORN_LIVE,
      }),
    );
  });
  it("denies Membership creating a member with a name below the length floor", async () => {
    await assertFails(
      setDoc(doc(as("u", ["Membership"]), "members/new_short"), {
        name: "Al",
        totalPoints: 0,
        ...BORN_LIVE,
      }),
    );
  });
  it("denies Membership renaming a member to a formula-shaped name", async () => {
    await assertFails(
      updateDoc(doc(as("u", ["Membership"]), "members/m1"), { name: "=cmd|'/C calc'!A1" }),
    );
  });
  it("denies Admin renaming a member to a name past the cap", async () => {
    await assertFails(
      updateDoc(doc(as("admin-uid", ["Admin"]), "members/m1"), { name: "a".repeat(81) }),
    );
  });
  // The other half of the gate: it must bind a WRITE of the name, not the mere existence
  // of a legacy one. Without touched('name') this denies every admin edit to this member.
  it("allows Membership editing another field on a member with a legacy-invalid name", async () => {
    await assertSucceeds(
      updateDoc(doc(as("u", ["Membership"]), "members/m_legacyname"), { profession: "Arquitecta" }),
    );
  });
  it("denies Membership rewriting a legacy-invalid name to another invalid one", async () => {
    await assertFails(
      updateDoc(doc(as("u", ["Membership"]), "members/m_legacyname"), { name: "Ana Rivas 3" }),
    );
  });
  // The self-lane half of the same affordance: the OWNER of a legacy-named doc must be able
  // to edit their own contact fields. Structurally the same check as the institutional arm,
  // but on a different arm — assert it rather than infer it.
  it("allows the owner of a legacy-invalid name to edit their own contact fields", async () => {
    await assertSucceeds(
      updateDoc(doc(as("legacyname-uid", ["Member"]), "members/m_legacyname"), {
        phone: "70099887",
      }),
    );
  });
  it("denies the owner of a legacy-invalid name changing it to another invalid one", async () => {
    await assertFails(
      updateDoc(doc(as("legacyname-uid", ["Member"]), "members/m_legacyname"), {
        name: "Ana Rivas 4",
      }),
    );
  });
  it("allows Membership repairing a legacy-invalid name to a valid one", async () => {
    await assertSucceeds(
      updateDoc(doc(as("u", ["Membership"]), "members/m_legacyname"), { name: "Ana Rivas" }),
    );
  });
  it("allows Admin to update a member that has NO uid field", async () => {
    await assertSucceeds(
      updateDoc(doc(as("admin-uid", ["Admin"]), "members/m_nouid"), { name: "Dora Nueva" }),
    );
  });
  it("allows Admin to assign a power cargo to a uid-less member (self-stamped)", async () => {
    await assertSucceeds(
      updateDoc(doc(as("admin-uid", ["Admin"]), "members/m_nouid"), {
        [`positions.${TERM}`]: { cargoId: "pos1", comisionIds: [], assignedBy: "admin-uid" },
      }),
    );
  });
  it("still denies adding a uid to a uid-less member via client update", async () => {
    await assertFails(updateDoc(doc(as("u", ["Admin"]), "members/m_nouid"), { uid: "sneak" }));
  });
  it("still denies removing an existing uid via client update", async () => {
    await assertFails(updateDoc(doc(as("u", ["Admin"]), "members/m1"), { uid: deleteField() }));
  });
  it("denies writing uid: null onto a member that has no uid", async () => {
    // unchanged('uid') passed this (null == null on a key-less doc). A stored null then
    // fails memberDocSchema, so parseDocs drops the member from every backstage list.
    await assertFails(updateDoc(doc(as("u", ["Admin"]), "members/m_nouid"), { uid: null }));
  });
  it("allows an institutional edit that resends the same publicProfile value", async () => {
    // The allowed branch of touched(): a same-value rewrite affects no key. This is what
    // keeps an admin form from being bricked if publicProfile ever joins memberSchema.
    // Set the value through the owner's lane first so the resend is genuinely a no-op —
    // this suite seeds once, so the field's state here depends on nothing else.
    await assertSucceeds(
      updateDoc(doc(as("owner-uid", ["Member"]), "members/m1"), { publicProfile: false }),
    );
    await assertSucceeds(
      updateDoc(doc(as("u", ["Admin"]), "members/m1"), {
        publicProfile: false,
        profession: "Ingeniera",
      }),
    );
  });
  it("denies a signed-in user self-editing a uid-less member's profilePicture", async () => {
    await assertFails(
      updateDoc(doc(as("anyone", ["Member"]), "members/m_nouid"), {
        profilePicture: "https://example/p.jpg",
      }),
    );
  });
  it("allows the owning member to set only their own profilePicture (H1 self-upload)", async () => {
    await assertSucceeds(
      updateDoc(doc(as("owner-uid", ["Member"]), "members/m1"), {
        profilePicture: "https://example/p.jpg",
      }),
    );
  });
  it("denies the owning member changing another field alongside profilePicture", async () => {
    // email, not name: the self lane accepts a well-formed name now, so a name companion
    // would make this pass for the wrong reason instead of testing the key-set guard.
    await assertFails(
      updateDoc(doc(as("owner-uid", ["Member"]), "members/m1"), {
        profilePicture: "https://example/p.jpg",
        email: "hijack@example.com",
      }),
    );
  });
  // Self-service profile (/me): a member owns their photo, name, birthdate, profession and
  // phone. Everything else on the doc — email, status, positions, points, roles — is an
  // institutional record the membership tier maintains.
  it("allows the owning member to edit their own contact/personal fields", async () => {
    await assertSucceeds(
      updateDoc(doc(as("owner-uid", ["Member"]), "members/m1"), {
        phone: "70011223",
        profession: "Arquitecta",
        birthdate: new Date("1996-04-02T00:00:00Z"),
      }),
    );
  });
  it("denies the owning member editing an institutional field alongside them", async () => {
    await assertFails(
      updateDoc(doc(as("owner-uid", ["Member"]), "members/m1"), {
        phone: "70011223",
        status: "Desafiliado",
      }),
    );
  });
  it("denies the owning member a malformed phone", async () => {
    await assertFails(
      updateDoc(doc(as("owner-uid", ["Member"]), "members/m1"), { phone: "+591 700-112" }),
    );
  });
  it("denies the owning member a non-timestamp birthdate", async () => {
    await assertFails(
      updateDoc(doc(as("owner-uid", ["Member"]), "members/m1"), { birthdate: "1996-04-02" }),
    );
  });
  it("allows the owning member to clear their optional phone", async () => {
    await assertSucceeds(
      updateDoc(doc(as("owner-uid", ["Member"]), "members/m1"), { phone: deleteField() }),
    );
  });
  it("denies the owning member clearing their birthdate", async () => {
    await assertFails(
      updateDoc(doc(as("owner-uid", ["Member"]), "members/m1"), { birthdate: deleteField() }),
    );
  });
  it("allows a member with a legacy phone to still change their photo", async () => {
    await assertSucceeds(
      updateDoc(doc(as("eva-uid", ["Member"]), "members/m_legacyphone"), {
        profilePicture: "https://example/p.jpg",
      }),
    );
  });
  // Rewriting the SAME legacy value is a no-op (absent from affectedKeys) and stays
  // allowed; changing it must land on the current format.
  it("denies that same member changing the phone to another malformed value", async () => {
    await assertFails(
      updateDoc(doc(as("eva-uid", ["Member"]), "members/m_legacyphone"), {
        phone: "+591 700-999",
      }),
    );
  });
  it("allows that same member replacing the legacy phone with 8 digits", async () => {
    await assertSucceeds(
      updateDoc(doc(as("eva-uid", ["Member"]), "members/m_legacyphone"), { phone: "70099887" }),
    );
  });
  // The cap the Zod schema mirrors (packages/types/src/member-schema.ts).
  it("allows a profession at the 80-character cap and denies 81", async () => {
    await assertSucceeds(
      updateDoc(doc(as("owner-uid", ["Member"]), "members/m1"), { profession: "a".repeat(80) }),
    );
    await assertFails(
      updateDoc(doc(as("owner-uid", ["Member"]), "members/m1"), { profession: "a".repeat(81) }),
    );
  });
  it("allows the owning member to opt in to the public Directiva (publicProfile)", async () => {
    await assertSucceeds(
      updateDoc(doc(as("owner-uid", ["Member"]), "members/m1"), { publicProfile: true }),
    );
    await assertSucceeds(
      updateDoc(doc(as("owner-uid", ["Member"]), "members/m1"), { publicProfile: false }),
    );
  });
  it("denies the owning member a non-bool publicProfile", async () => {
    await assertFails(
      updateDoc(doc(as("owner-uid", ["Member"]), "members/m1"), { publicProfile: "yes" }),
    );
  });
  it("allows an Admin to turn publication OFF (takedown for a member who can't reach /me)", async () => {
    // Opt in first: false-onto-false touches no key, so the institutional arm would carry
    // the write and this would pass without the takedown arm existing at all.
    await assertSucceeds(
      updateDoc(doc(as("owner-uid", ["Member"]), "members/m1"), { publicProfile: true }),
    );
    await assertSucceeds(
      updateDoc(doc(as("admin-uid", ["Admin"]), "members/m1"), { publicProfile: false }),
    );
  });
  it("denies the takedown arm any second field", async () => {
    // Opt in first: writing false onto an already-false doc affects no key, so the
    // institutional arm would accept it and the test would prove nothing.
    await assertSucceeds(
      updateDoc(doc(as("owner-uid", ["Member"]), "members/m1"), { publicProfile: true }),
    );
    await assertFails(
      updateDoc(doc(as("admin-uid", ["Admin"]), "members/m1"), {
        publicProfile: false,
        name: "Renamed",
      }),
    );
    // Restore: this suite seeds once and never resets, so leaving m1 opted IN would make
    // a later "deny an Admin setting publicProfile" test write an unchanged value — which
    // touches no key and is legitimately allowed, i.e. a green test proving nothing.
    await assertSucceeds(
      updateDoc(doc(as("owner-uid", ["Member"]), "members/m1"), { publicProfile: false }),
    );
  });
  it("denies an institutional writer an explicit null on a doc that lacks the key", async () => {
    // unchanged() would pass this (null == null on a key-less doc) — touched() is what
    // catches it. A null also fails memberDocSchema, dropping the member from the UI.
    await assertFails(
      updateDoc(doc(as("admin-uid", ["Admin"]), "members/m_nouid"), { publicProfile: null }),
    );
  });
  // Scope note: this proves the DIRECT write is denied, not that publication requires the
  // member's participation — with the opt-out default, the institutional tier can still
  // compose one via profilePicture + a board cargo. See the create-arm comment.
  it("denies an Admin writing another member's publicProfile directly", async () => {
    // m1.uid === "owner-uid"; the admin is a different uid, so only the institutional
    // arm could apply — and it now pins publicProfile via unchanged().
    await assertFails(
      updateDoc(doc(as("admin-uid", ["Admin"]), "members/m1"), { publicProfile: true }),
    );
  });
  it("denies a soft-deleted member editing their own archived record", async () => {
    await assertFails(
      updateDoc(doc(as("bea-uid", ["Member"]), "members/m_deleted"), { phone: "70011223" }),
    );
  });
  it("denies a non-owner member editing another member's contact fields", async () => {
    await assertFails(
      updateDoc(doc(as("stranger", ["Member"]), "members/m1"), { phone: "70011223" }),
    );
  });
  it("denies a non-owner member setting another member's profilePicture", async () => {
    await assertFails(
      updateDoc(doc(as("stranger", ["Member"]), "members/m1"), {
        profilePicture: "https://example/p.jpg",
      }),
    );
  });
  // /me self-rename. The name is world-readable (boardShowcase republishes on this very
  // write) and lands in the members CSV, so the character set is the boundary — the form
  // normalizes first, so these rules only ever legitimately see a cleaned value.
  // NOTE: every allowed rename below must write a DIFFERENT value from the previous one —
  // an identical write is absent from affectedKeys() and would pass vacuously.
  it("allows the owning member to rename themselves", async () => {
    await assertSucceeds(
      updateDoc(doc(as("owner-uid", ["Member"]), "members/m1"), { name: "Ana María Rivas-Paz" }),
    );
  });
  it("allows an apostrophe and a middle initial", async () => {
    await assertSucceeds(
      updateDoc(doc(as("owner-uid", ["Member"]), "members/m1"), { name: "Ana M. O'Brien" }),
    );
  });
  // Latin Extended-A, for the Croatian/Slavic surnames the Santa Cruz chapter carries. The
  // mirror test only proves the rules and zod hold the SAME pattern string — this proves the
  // rules engine's RE2 actually matches the widened rune ranges.
  it("allows a Latin Extended-A surname", async () => {
    await assertSucceeds(
      updateDoc(doc(as("owner-uid", ["Member"]), "members/m1"), { name: "Zvonko Matkovi\u0107" }),
    );
  });
  it("allows a name at the cap and denies one past it", async () => {
    await assertSucceeds(
      updateDoc(doc(as("owner-uid", ["Member"]), "members/m1"), { name: "a".repeat(80) }),
    );
    await assertFails(
      updateDoc(doc(as("owner-uid", ["Member"]), "members/m1"), { name: "a".repeat(81) }),
    );
  });
  // 60 accented characters = 60 chars but 120 UTF-8 bytes. Succeeds iff the rules engine's
  // String.size() counts CHARACTERS — pinning the semantics the zod cap (code units)
  // assumes. If this ever flips, an accented name passes the form and dies as a generic
  // "no se pudo guardar" with nothing else failing.
  it("caps the name in characters, not UTF-8 bytes", async () => {
    await assertSucceeds(
      updateDoc(doc(as("owner-uid", ["Member"]), "members/m1"), { name: "ñ".repeat(60) }),
    );
  });
  it("denies a name below the length floor", async () => {
    await assertFails(updateDoc(doc(as("owner-uid", ["Member"]), "members/m1"), { name: "Al" }));
  });
  it("denies an empty name", async () => {
    await assertFails(updateDoc(doc(as("owner-uid", ["Member"]), "members/m1"), { name: "" }));
  });
  it("denies clearing the name", async () => {
    await assertFails(
      updateDoc(doc(as("owner-uid", ["Member"]), "members/m1"), { name: deleteField() }),
    );
  });
  it("denies a non-string name", async () => {
    await assertFails(updateDoc(doc(as("owner-uid", ["Member"]), "members/m1"), { name: 12345 }));
  });
  // The character class means a spreadsheet formula cannot be REPRESENTED as a name. The
  // CSV export escapes formula prefixes anyway — it must also cover legacy names and the
  // columns that carry no pattern at all.
  it("denies every spreadsheet formula prefix", async () => {
    for (const prefix of ["=", "+", "-", "@", "\t", "\r"]) {
      await assertFails(
        updateDoc(doc(as("owner-uid", ["Member"]), "members/m1"), { name: `${prefix}Ana Rivas` }),
      );
    }
  });
  it("denies digits, CSV structural characters and newlines in a name", async () => {
    for (const bad of ["Ana Rivas 2", "Rivas, Ana", 'Ana "A" Rivas', "Ana\nRivas", "<b>Ana</b>"]) {
      await assertFails(updateDoc(doc(as("owner-uid", ["Member"]), "members/m1"), { name: bad }));
    }
  });
  // The form normalizes these away before writing; the rules have no normalizer, so the
  // raw shapes are denied rather than repaired.
  it("denies leading, trailing and doubled spaces", async () => {
    for (const bad of [" Ana Rivas", "Ana Rivas ", "Ana  Rivas"]) {
      await assertFails(updateDoc(doc(as("owner-uid", ["Member"]), "members/m1"), { name: bad }));
    }
  });
  it("denies a rename bundled with an institutional field", async () => {
    await assertFails(
      updateDoc(doc(as("owner-uid", ["Member"]), "members/m1"), {
        name: "Ana Nueva",
        status: "Desafiliado",
      }),
    );
  });
  it("denies a non-owner renaming another member", async () => {
    await assertFails(
      updateDoc(doc(as("stranger", ["Member"]), "members/m1"), { name: "Ana Secuestrada" }),
    );
  });
  it("allows soft-deleting a live member (active true -> false)", async () => {
    await assertSucceeds(
      updateDoc(doc(as("u", ["Membership"]), "members/m1"), {
        active: false,
        deletedAt: new Date("2026-02-01T00:00:00Z"),
      }),
    );
  });
  it("denies resurrecting a soft-deleted member (active false -> true)", async () => {
    await assertFails(updateDoc(doc(as("u", ["Admin"]), "members/m_deleted"), { active: true }));
  });
  it("denies unsetting deletedAt on a soft-deleted member", async () => {
    await assertFails(updateDoc(doc(as("u", ["Admin"]), "members/m_deleted"), { deletedAt: null }));
  });
  it("denies a Member from updating their own profile", async () => {
    // A VALID name: a 1-character one would be denied by the length floor even for a live owner, which
    // would stop this from isolating the active gate it is named for.
    await assertFails(
      updateDoc(doc(as("bea-uid", ["Member"]), "members/m_deleted"), { name: "Bea Nueva" }),
    );
  });
});

describe("firestore.rules — allies", () => {
  it("allows ProjectManager to read", async () => {
    await assertSucceeds(getDoc(doc(as("u", ["ProjectManager"]), "allies/a1")));
  });
  it("denies a plain Member from reading allies", async () => {
    await assertFails(getDoc(doc(as("u", ["Member"]), "allies/a1")));
  });
  it("denies ProjectManager from writing allies", async () => {
    await assertFails(
      updateDoc(doc(as("u", ["ProjectManager"]), "allies/a1"), { companyName: "X" }),
    );
  });
  it("allows Admin to write allies", async () => {
    await assertSucceeds(updateDoc(doc(as("u", ["Admin"]), "allies/a1"), { companyName: "X" }));
  });
  it("denies Membership writing allies (the Ally trio moved to Secretaría)", async () => {
    await assertFails(
      updateDoc(doc(as("u", ["Membership"]), "allies/a1"), {
        active: false,
        deletedAt: new Date("2026-02-01T00:00:00Z"),
      }),
    );
  });
  it("allows Secretary to soft-delete an ally (manage:Ally)", async () => {
    await assertSucceeds(
      updateDoc(doc(as("u", ["Secretary"]), "allies/a1"), {
        active: false,
        deletedAt: new Date("2026-02-01T00:00:00Z"),
      }),
    );
  });
});

describe("firestore.rules — pointRules", () => {
  it("allows signed-in read", async () => {
    await assertSucceeds(getDoc(doc(as("u", ["Member"]), "pointRules/r1")));
  });
  it("allows Admin write", async () => {
    await assertSucceeds(updateDoc(doc(as("u", ["Admin"]), "pointRules/r1"), { points: 20 }));
  });
  it("denies non-admin write", async () => {
    await assertFails(updateDoc(doc(as("u", ["Membership"]), "pointRules/r1"), { points: 20 }));
  });
  it("denies non-admin create (seed path)", async () => {
    await assertFails(
      setDoc(doc(as("u", ["Membership"]), "pointRules/2026__DirectProgram"), { points: 5 }),
    );
  });
});

describe("firestore.rules — terms", () => {
  it("allows any signed-in user to read", async () => {
    await assertSucceeds(getDoc(doc(as("u", ["Member"]), "terms/2026")));
  });
  it("denies anonymous read", async () => {
    await assertFails(getDoc(doc(anon(), "terms/2026")));
  });
  it("allows Admin to create a term", async () => {
    await assertSucceeds(setDoc(doc(as("u", ["Admin"]), "terms/2027"), { status: "Activo" }));
  });
  it("allows Admin to update a term", async () => {
    await assertSucceeds(updateDoc(doc(as("u", ["Admin"]), "terms/2026"), { status: "Cerrado" }));
  });
  it("denies a non-Admin write", async () => {
    await assertFails(setDoc(doc(as("u", ["Membership"]), "terms/2028"), { status: "Activo" }));
  });
});

describe("firestore.rules — activities", () => {
  it("allows any signed-in user to read", async () => {
    await assertSucceeds(getDoc(doc(as("u", ["Member"]), "activities/act1")));
  });
  it("denies anonymous read", async () => {
    await assertFails(getDoc(doc(anon(), "activities/act1")));
  });
  it("allows Admin to create an activity", async () => {
    await assertSucceeds(
      setDoc(doc(as("u", ["Admin"]), "activities/act2"), { termId: "2026", category: "Course" }),
    );
  });
  it("allows ProjectManager to create and update an activity", async () => {
    await assertSucceeds(
      setDoc(doc(as("u", ["ProjectManager"]), "activities/act3"), {
        termId: "2026",
        category: "ProjectExecution",
      }),
    );
    await assertSucceeds(
      updateDoc(doc(as("u", ["ProjectManager"]), "activities/act1"), { category: "Course" }),
    );
  });
  it("denies a plain Member create", async () => {
    await assertFails(
      setDoc(doc(as("u", ["Member"]), "activities/act4"), { termId: "2026", category: "Assembly" }),
    );
  });
});

describe("firestore.rules — programs", () => {
  it("allows any signed-in user to read", async () => {
    await assertSucceeds(getDoc(doc(as("u", ["Member"]), "programs/prog1")));
  });
  it("denies anonymous read", async () => {
    await assertFails(getDoc(doc(anon(), "programs/prog1")));
  });
  it("allows ProjectManager to create", async () => {
    await assertSucceeds(
      setDoc(doc(as("u", ["ProjectManager"]), "programs/prog2"), { termId: "2026", title: "Y" }),
    );
  });
  it("allows Admin to update", async () => {
    await assertSucceeds(updateDoc(doc(as("u", ["Admin"]), "programs/prog1"), { title: "Z" }));
  });
  it("denies a non-privileged role write", async () => {
    await assertFails(updateDoc(doc(as("u", ["Treasury"]), "programs/prog1"), { title: "Nope" }));
  });
});

describe("firestore.rules — initiative direction branch", () => {
  it("lets a direction uid update status", async () => {
    await assertSucceeds(
      updateDoc(doc(as("owner-uid", ["Member"]), "projects/p_dir"), { status: "Planificacion" }),
    );
  });
  it("denies a non-direction member", async () => {
    await assertFails(
      updateDoc(doc(as("other-uid", ["Member"]), "projects/p_dir"), { status: "Planificacion" }),
    );
  });
  it("denies direction touching directionUids", async () => {
    await assertFails(
      updateDoc(doc(as("owner-uid", ["Member"]), "projects/p_dir"), {
        directionUids: ["owner-uid", "evil-uid"],
      }),
    );
  });
  it("denies changing termId even for Admin", async () => {
    await assertFails(updateDoc(doc(as("u", ["Admin"]), "projects/p_dir"), { termId: "2027" }));
  });
  it("locks status once finalReport is filed (even Admin)", async () => {
    await assertFails(
      updateDoc(doc(as("u", ["Admin"]), "projects/p_done"), { status: "EnEjecucion" }),
    );
  });
  it("locks finalReport and impact once filed", async () => {
    await assertFails(updateDoc(doc(as("u", ["Admin"]), "projects/p_done"), { finalReport: null }));
    await assertFails(
      updateDoc(doc(as("u", ["Admin"]), "projects/p_done"), {
        impact: { personsImpacted: 9, volunteers: 9, custom: [], closingSummary: "edit" },
      }),
    );
  });
  it("locks the roster once finalReport is filed (even Admin)", async () => {
    await assertFails(
      updateDoc(doc(as("u", ["Admin"]), "projects/p_done"), {
        roster: { directorId: "m2", coDirectorIds: [], teamIds: [] },
      }),
    );
  });
  it("locks start/end dates once finalReport is filed (even Admin)", async () => {
    await assertFails(
      updateDoc(doc(as("u", ["Admin"]), "projects/p_done"), {
        startDate: new Date("2026-01-01T00:00:00Z"),
      }),
    );
    await assertFails(
      updateDoc(doc(as("u", ["Admin"]), "projects/p_done"), {
        endDate: new Date("2026-02-01T00:00:00Z"),
      }),
    );
  });
  it("locks roster/dates for a direction-only editor too (not just Admin)", async () => {
    // p_done.directionUids includes owner-uid → isDirection() passes, but the
    // finalized lock still denies the roster/date write.
    await assertFails(
      updateDoc(doc(as("owner-uid", ["Member"]), "projects/p_done"), {
        roster: { directorId: "m2", coDirectorIds: [], teamIds: [] },
      }),
    );
    await assertFails(
      updateDoc(doc(as("owner-uid", ["Member"]), "projects/p_done"), {
        startDate: new Date("2026-01-01T00:00:00Z"),
      }),
    );
  });
  it("locks a partial roster merge (teamIds-only dot-path) once finalReport is filed", async () => {
    await assertFails(
      updateDoc(doc(as("u", ["Admin"]), "projects/p_done"), { "roster.teamIds": ["m9"] }),
    );
  });
  it("still allows title edits on a completed initiative", async () => {
    await assertSucceeds(
      updateDoc(doc(as("u", ["Admin"]), "projects/p_done"), { title: "Done (renombrado)" }),
    );
  });
  it("lets Admin set the featured flag", async () => {
    await assertSucceeds(updateDoc(doc(as("u", ["Admin"]), "projects/p_feat"), { featured: true }));
  });
  it("lets ProjectManager set the featured flag", async () => {
    await assertSucceeds(
      updateDoc(doc(as("u", ["ProjectManager"]), "programs/prog_feat"), { featured: true }),
    );
  });
  it("denies a direction-only editor setting featured true (project)", async () => {
    await assertFails(
      updateDoc(doc(as("owner-uid", ["Member"]), "projects/p_dir"), { featured: true }),
    );
  });
  it("denies a direction-only editor setting featured true (program)", async () => {
    await assertFails(
      updateDoc(doc(as("owner-uid", ["Member"]), "programs/prog_dir"), { featured: true }),
    );
  });
  it("lets Admin toggle featured on a finalized initiative", async () => {
    await assertSucceeds(
      updateDoc(doc(as("u", ["Admin"]), "projects/p_final_ok"), { featured: true }),
    );
  });
  it("denies a direction-only editor toggling featured on a finalized initiative", async () => {
    await assertFails(
      updateDoc(doc(as("owner-uid", ["Member"]), "projects/p_final_dir"), { featured: true }),
    );
  });
  it("lets a direction-only editor update other fields while featured is untouched", async () => {
    await assertSucceeds(
      updateDoc(doc(as("owner-uid", ["Member"]), "projects/p_dir"), { title: "Eco (dir edit)" }),
    );
  });
  it("lets a direction-only editor echo featured:false on a legacy doc (absent == false)", async () => {
    // The form always sends `featured`; on a pre-feature doc (no field) that value is
    // false. Treating absent as false must NOT deny the edit. Regression guard.
    await assertSucceeds(
      updateDoc(doc(as("owner-uid", ["Member"]), "programs/prog_dir"), {
        title: "Eco Prog (dir)",
        featured: false,
      }),
    );
  });
  it("denies create with non-empty directionUids", async () => {
    await assertFails(
      setDoc(doc(as("u", ["ProjectManager"]), "projects/p_new"), {
        termId: "2026",
        title: "X",
        directionUids: ["u"],
        finalReport: null,
      }),
    );
  });
  it("allows PM create without directionUids", async () => {
    await assertSucceeds(
      setDoc(doc(as("u", ["ProjectManager"]), "projects/p_new2"), {
        termId: "2026",
        title: "X",
        finalReport: null,
      }),
    );
  });
  it("denies create with status Finalizado", async () => {
    await assertFails(
      setDoc(doc(as("u", ["ProjectManager"]), "projects/p_new3"), {
        termId: "2026",
        title: "X",
        status: "Finalizado",
        finalReport: null,
      }),
    );
  });
  it("denies create with pre-filled impact", async () => {
    await assertFails(
      setDoc(doc(as("u", ["ProjectManager"]), "projects/p_new4"), {
        termId: "2026",
        title: "X",
        impact: { personsImpacted: 1, volunteers: 1, custom: [], closingSummary: "x" },
        finalReport: null,
      }),
    );
  });
  it("lets a direction uid update a program status (mirrored)", async () => {
    await assertSucceeds(
      updateDoc(doc(as("owner-uid", ["Member"]), "programs/prog_dir"), { status: "Planificacion" }),
    );
  });
  it("denies a non-direction member on a program (mirrored)", async () => {
    await assertFails(
      updateDoc(doc(as("other-uid", ["Member"]), "programs/prog_dir"), { status: "Planificacion" }),
    );
  });
  it("direction may edit roster (documented escalation: mirrors new co-director uids)", async () => {
    await assertSucceeds(
      updateDoc(doc(as("owner-uid", ["Member"]), "projects/p_dir"), {
        roster: { directorId: "m1", coDirectorIds: ["m2"], teamIds: [] },
      }),
    );
  });
  it("legacy doc without directionUids: Admin may edit, nobody is direction", async () => {
    await assertSucceeds(updateDoc(doc(as("u", ["Admin"]), "projects/p1"), { title: "Legacy" }));
    await assertFails(
      updateDoc(doc(as("owner-uid", ["Member"]), "projects/p1"), { title: "Nope" }),
    );
  });
  it("denies setting Finalizado without a finalReport", async () => {
    await assertFails(
      updateDoc(doc(as("owner-uid", ["Member"]), "projects/p_dir"), { status: "Finalizado" }),
    );
  });
  it("denies Admin setting Finalizado without a finalReport", async () => {
    await assertFails(
      updateDoc(doc(as("u", ["Admin"]), "projects/p_dir"), { status: "Finalizado" }),
    );
  });
  it("denies completing a program without a finalReport (mirrored)", async () => {
    await assertFails(
      updateDoc(doc(as("owner-uid", ["Member"]), "programs/prog_dir"), { status: "Finalizado" }),
    );
  });
  it("lets direction complete with the full trio", async () => {
    await assertSucceeds(
      updateDoc(doc(as("owner-uid", ["Member"]), "projects/p_complete"), {
        status: "Finalizado",
        finalReport: { filedAt: new Date("2026-06-11T00:00:00Z"), filedBy: "owner-uid" },
        impact: {
          personsImpacted: 120,
          volunteers: 8,
          custom: [],
          closingSummary: "Cerrado con éxito.",
        },
      }),
    );
  });
  it("allows ProjectManager (non-direction) to complete with the full trio", async () => {
    await assertSucceeds(
      updateDoc(doc(as("pm-uid", ["ProjectManager"]), "projects/p_pm"), {
        status: "Finalizado",
        finalReport: { filedAt: new Date("2026-06-11T00:00:00Z"), filedBy: "pm-uid" },
        impact: { personsImpacted: 10, volunteers: 2, custom: [], closingSummary: "Cierre PM." },
      }),
    );
  });
  it("denies a plain Member (non-direction) completing even with the full trio", async () => {
    await assertFails(
      updateDoc(doc(as("other-uid", ["Member"]), "projects/p_dir"), {
        status: "Finalizado",
        finalReport: { filedAt: new Date("2026-06-11T00:00:00Z"), filedBy: "other-uid" },
        impact: { personsImpacted: 10, volunteers: 2, custom: [], closingSummary: "Cierre." },
      }),
    );
  });
  it("denies completing with a forged filedBy (not the caller)", async () => {
    await assertFails(
      updateDoc(doc(as("owner-uid", ["Member"]), "projects/p_dir"), {
        status: "Finalizado",
        finalReport: { filedAt: new Date("2026-06-11T00:00:00Z"), filedBy: "someone-else" },
        impact: { personsImpacted: 1, volunteers: 1, custom: [], closingSummary: "Forjado." },
      }),
    );
  });
  it("denies completing with a report but null impact", async () => {
    await assertFails(
      updateDoc(doc(as("owner-uid", ["Member"]), "projects/p_dir"), {
        status: "Finalizado",
        finalReport: { filedAt: new Date("2026-06-11T00:00:00Z"), filedBy: "owner-uid" },
        impact: null,
      }),
    );
  });
});

describe("firestore.rules — checkIns", () => {
  it("allows any signed-in user to read", async () => {
    await assertSucceeds(getDoc(doc(as("u", ["Member"]), "checkIns/c1")));
  });
  it("allows Admin to create", async () => {
    await assertSucceeds(
      setDoc(doc(as("u", ["Admin"]), "checkIns/c_admin"), {
        memberId: "m1",
        activityId: "a1",
        role: "Attendee",
      }),
    );
  });
  it("allows ProjectManager to create", async () => {
    await assertSucceeds(
      setDoc(doc(as("u", ["ProjectManager"]), "checkIns/c_pm"), {
        memberId: "m1",
        activityId: "a1",
        role: "Attendee",
      }),
    );
  });
  it("allows a Scanner to create an Attendee check-in", async () => {
    await assertSucceeds(
      setDoc(doc(as("s1", ["Scanner"]), "checkIns/c_scan"), {
        memberId: "m1",
        activityId: "a1",
        role: "Attendee",
      }),
    );
  });
  it("allows a Scanner on any in-window activity (event scoping deliberately abandoned)", async () => {
    // The scannerEventIds claim is gone. A Scanner's blast radius is now bounded by the
    // check-in WINDOW and the Attendee conjunct, not by an event allowlist.
    await assertSucceeds(
      setDoc(doc(as("s_any", ["Scanner"]), "checkIns/c_scan_any"), {
        memberId: "m1",
        activityId: "a1",
        role: "Attendee",
      }),
    );
  });
  // C2 regression: see the BLOCKING case below.
  it("denies a Scanner registering a non-Attendee role (no self-award of director points)", async () => {
    await assertFails(
      // memberId must be a member that EXISTS (m1), or exists(members/…) on the create arm
      // denies this on its own and the role == 'Attendee' conjunct is never exercised —
      // which is what made this test vacuous for the conjunct it is credited with.
      setDoc(doc(as("s3", ["Scanner"]), "checkIns/c_dir"), {
        memberId: "m1",
        activityId: "a1",
        role: "Director",
      }),
    );
  });
  it("BLOCKING: a Scanner holding the coarse checkIn:Attendance perm still cannot register a Director row", async () => {
    // C2: giving Scanner the coarse perm satisfies the rule's first arm, so the
    // role == 'Attendee' clause on the Scanner-specific arm is never reached. 10 pts for
    // DirectProgram vs 3 for AttendActivity — a scanner could self-award, and undo a real
    // director's row through the matching delete arm.
    await assertFails(
      setDoc(doc(as("s_coarse", ["Scanner"]), "checkIns/c_coarse_dir"), {
        memberId: "m1",
        activityId: "a1",
        role: "Director",
      }),
    );
  });
  it("denies a Scanner creating for a non-existent member (no phantom check-ins)", async () => {
    await assertFails(
      setDoc(doc(as("s4", ["Scanner"]), "checkIns/c_ghost"), {
        memberId: "ghost",
        activityId: "a1",
        role: "Attendee",
      }),
    );
  });
  it("allows a Scanner that also holds manage:Attendance to register a Director row", async () => {
    // The named escape hatch in the conjunct: a custom role granted manage:Attendance
    // legitimately manages the whole roster, Scanner name or not.
    await assertSucceeds(
      setDoc(
        doc(
          as("s_mgr", ["Scanner"], ["checkIn:Attendance", "manage:Attendance", "read:Activity"]),
          "checkIns/c_scan_mgr",
        ),
        { memberId: "m1", activityId: "a1", role: "Director" },
      ),
    );
  });
  it("denies a plain Member from creating", async () => {
    await assertFails(
      setDoc(doc(as("u", ["Member"]), "checkIns/c_m"), {
        memberId: "m1",
        activityId: "a1",
        role: "Attendee",
      }),
    );
  });
  it("denies a non-Admin check-in once the activity's day has passed", async () => {
    await assertFails(
      setDoc(doc(as("u", ["ProjectManager"]), "checkIns/c_old"), {
        memberId: "m1",
        activityId: "act_old",
        role: "Attendee",
      }),
    );
  });
  it("allows an Admin to backdate a check-in (day-window escape hatch)", async () => {
    await assertSucceeds(
      setDoc(doc(as("u", ["Admin"]), "checkIns/c_old_admin"), {
        memberId: "m1",
        activityId: "act_old",
        role: "Attendee",
      }),
    );
  });
  it("keeps an Admin blocked on a backdated cancelled activity (hatch is day-window only)", async () => {
    await assertFails(
      setDoc(doc(as("u", ["Admin"]), "checkIns/c_old_cancel"), {
        memberId: "m1",
        activityId: "act_old_cancel",
        role: "Attendee",
      }),
    );
  });
  it("keeps an Admin blocked when a backdated activity's parent is Finalizado (hatch is day-window only)", async () => {
    await assertFails(
      setDoc(doc(as("u", ["Admin"]), "checkIns/c_old_closed"), {
        memberId: "m1",
        activityId: "act_old_closed_parent",
        role: "Attendee",
      }),
    );
  });
  it("denies a check-in when the parent initiative is Finalizado", async () => {
    await assertFails(
      setDoc(doc(as("u", ["Admin"]), "checkIns/c_closed"), {
        memberId: "m1",
        activityId: "act_closed_parent",
        role: "Attendee",
      }),
    );
  });
  it("denies a check-in for a cancelled activity", async () => {
    await assertFails(
      setDoc(doc(as("u", ["Admin"]), "checkIns/c_cancel"), {
        memberId: "m1",
        activityId: "act_cancel",
        role: "Attendee",
      }),
    );
  });
  it("denies a check-in when the activity has a malformed parentType (fails closed)", async () => {
    await assertFails(
      setDoc(doc(as("u", ["Admin"]), "checkIns/c_badparent"), {
        memberId: "m1",
        activityId: "act_badparent",
        role: "Attendee",
      }),
    );
  });
  it("denies a check-in for a non-existent activity", async () => {
    await assertFails(
      setDoc(doc(as("u", ["Admin"]), "checkIns/c_ghostact"), {
        memberId: "m1",
        activityId: "does_not_exist",
        role: "Attendee",
      }),
    );
  });
  it("denies update", async () => {
    await assertFails(updateDoc(doc(as("u", ["Admin"]), "checkIns/c1"), { role: "Director" }));
  });
  it("allows Admin to delete a check-in within the window (mis-scan correction)", async () => {
    await assertSucceeds(deleteDoc(doc(as("u", ["Admin"]), "checkIns/c_del_admin")));
  });
  it("allows a Scanner to delete an Attendee row within the window", async () => {
    await assertSucceeds(deleteDoc(doc(as("s1", ["Scanner"]), "checkIns/c_del_scan")));
  });
  it("denies a plain Member from deleting", async () => {
    await assertFails(deleteDoc(doc(as("u", ["Member"]), "checkIns/c1")));
  });
  it("denies a non-Admin delete once the activity's day has passed (window binds delete too)", async () => {
    await assertFails(deleteDoc(doc(as("u", ["ProjectManager"]), "checkIns/c_del_old")));
  });
  it("denies a Scanner deleting a non-Attendee row (the delete-side conjunct)", async () => {
    await assertFails(deleteDoc(doc(as("s1", ["Scanner"]), "checkIns/c_del_director")));
  });
  it("allows Admin to delete a past-day check-in (day-window bypass on delete)", async () => {
    await assertSucceeds(deleteDoc(doc(as("u", ["Admin"]), "checkIns/c_del_old_admin")));
  });
  it("denies delete on a cancelled activity (window binds delete)", async () => {
    await assertFails(deleteDoc(doc(as("u", ["Admin"]), "checkIns/c_del_cancel")));
  });
  it("denies delete when the parent initiative is Finalizado", async () => {
    await assertFails(deleteDoc(doc(as("u", ["Admin"]), "checkIns/c_del_closed")));
  });
  // REMOVED as vacuous, not lost coverage — do not restore. Four tests here claimed the
  // Scanner `Attendee` conjunct "survives a roles/Scanner deactivation", leaning on a
  // deactivated roles/Scanner fixture. They could not fail: firestore.rules never reads a
  // roles/{id} doc (the only get(/databases/...) calls target positions, activities and
  // members), and the as() helper above synthesizes the token from permsForRoles(), a
  // static table in tools/scripts/lib/role-seed.mjs. So the fixture's `active` had zero
  // causal connection to hasAnyRole(['Scanner']) — the tests passed identically with the
  // role active, with the fixture deleted, or with the whole role-lifecycle change
  // reverted. They also coupled to execution order (one case deleted a checkIns doc
  // another case created) in a suite that seeds once and never resets.
  //
  // The rules paths they nominally covered stay pinned NON-vacuously by "denies a Scanner
  // registering a non-Attendee role" (create arm, twinned with "allows a Scanner to create
  // an Attendee check-in") and "denies a Scanner deleting a non-Attendee row" (delete arm,
  // twinned with "allows a Scanner to delete an Attendee row within the window").
  //
  // The residual they were meant to guard is real but lives in beacon, not in rules:
  // computeMemberRoles takes {trustedGrants, hadScanner} and reads no role doc, which is
  // why a deactivated role keeps its name in the claim. A unit test on that signature is
  // the honest guard.
});

describe("firestore.rules — participations", () => {
  it("allows signed-in read (ledger behind the points table)", async () => {
    await assertSucceeds(getDoc(doc(as("u", ["Member"]), "participations/part1")));
  });
  it("denies anonymous read", async () => {
    await assertFails(getDoc(doc(anon(), "participations/part1")));
  });
  it("denies all client writes (engine-only)", async () => {
    await assertFails(
      setDoc(doc(as("u", ["Admin"]), "participations/part2"), { memberId: "m1", termId: "2026" }),
    );
  });
});

describe("firestore.rules — memberPoints", () => {
  it("allows signed-in read (public to members)", async () => {
    await assertSucceeds(getDoc(doc(as("u", ["Member"]), "memberPoints/2025/03/e1")));
  });
  it("denies anonymous read", async () => {
    await assertFails(getDoc(doc(anon(), "memberPoints/2025/03/e1")));
  });
  it("denies all client writes", async () => {
    await assertFails(setDoc(doc(as("u", ["Admin"]), "memberPoints/2025/03/e1"), { p: 1 }));
  });
});

describe("firestore.rules — public + deny-all", () => {
  it("denies anonymous read of projects (D1 restricted; was public)", async () => {
    await assertFails(getDoc(doc(anon(), "projects/p1")));
  });
  it("allows a signed-in user to read projects", async () => {
    await assertSucceeds(getDoc(doc(as("u", ["Member"]), "projects/p1")));
  });
  it("denies read + write of the removed board collection (falls through to deny-all)", async () => {
    await assertFails(getDoc(doc(anon(), "board/b1")));
    await assertFails(getDoc(doc(as("u", ["Admin"]), "board/b1")));
    await assertFails(setDoc(doc(as("u", ["Admin"]), "board/b1"), { title: "X" }));
  });
  it("denies read + write of the removed events collection (falls through to deny-all)", async () => {
    await assertFails(getDoc(doc(anon(), "events/e1")));
    await assertFails(getDoc(doc(as("u", ["Admin"]), "events/e1")));
    await assertFails(setDoc(doc(as("u", ["Admin"]), "events/e1"), { title: "X" }));
    await assertFails(
      setDoc(doc(as("u", ["ExecutiveCommittee"]), "events/e2"), { title: "Asamblea" }),
    );
  });
  it("denies access to an unlisted collection", async () => {
    await assertFails(getDoc(doc(as("u", ["Admin"]), "settings/s1")));
  });
});

describe("firestore.rules — positions", () => {
  it("denies anonymous reads", async () => {
    await assertFails(getDoc(doc(anon(), "positions/pos1")));
  });
  it("allows any signed-in user to read", async () => {
    await assertSucceeds(getDoc(doc(as("u", ["Member"]), "positions/pos1")));
  });
  it("denies ExecutiveCommittee creating a position (manage:Position withdrawn)", async () => {
    // Cargo/comisión curation is Admin-only now; CEL keeps read (positions read=signedIn).
    await assertFails(
      setDoc(doc(as("u", ["ExecutiveCommittee"]), "positions/new1"), {
        title: "Director de Comunicación",
        titleFemale: "Directora de Comunicación",
        category: "JDL",
        grants: [],
        term: 2026,
        description: "Comunica.",
        active: true,
        deletedAt: null,
      }),
    );
  });
  it("allows Admin to create a grant-free position (the surviving authority)", async () => {
    await assertSucceeds(
      setDoc(doc(as("admin-uid", ["Admin"]), "positions/new1"), {
        title: "Director de Comunicación",
        titleFemale: "Directora de Comunicación",
        category: "JDL",
        grants: [],
        term: 2026,
        description: "Comunica.",
        active: true,
        deletedAt: null,
      }),
    );
  });
  it("denies Membership creating positions", async () => {
    await assertFails(
      setDoc(doc(as("u", ["Membership"]), "positions/new2"), { title: "X", ...BORN_LIVE }),
    );
  });
  it("denies resurrecting a soft-deleted position", async () => {
    await assertFails(
      updateDoc(doc(as("u", ["Admin"]), "positions/pos_deleted"), { active: true }),
    );
  });
  it("denies ExecutiveCommittee creating a position with grants", async () => {
    await assertFails(
      setDoc(doc(as("u", ["ExecutiveCommittee"]), "positions/new_priv"), {
        title: "Cargo Sombra",
        titleFemale: "Cargo Sombra",
        category: "JDL",
        grants: ["Admin"],
        term: 2026,
        description: "Escalación.",
        active: true,
        deletedAt: null,
      }),
    );
  });
  it("allows Admin to create a position with grants", async () => {
    await assertSucceeds(
      setDoc(doc(as("u", ["Admin"]), "positions/admin_created"), {
        title: "Presidente",
        titleFemale: "Presidenta",
        category: "CEL",
        grants: ["Admin"],
        term: null,
        description: "Dirige el capítulo.",
        active: true,
        deletedAt: null,
      }),
    );
  });
  it("denies creating a Comision position with grants — even Admin (chips-only)", async () => {
    await assertFails(
      setDoc(doc(as("u", ["Admin"]), "positions/com_priv"), {
        title: "Comité Sombra",
        sigla: "CS",
        category: "Comision",
        grants: ["Membership"],
        term: null,
        description: "Escalación.",
        active: true,
        deletedAt: null,
      }),
    );
  });
  it("allows Admin creating a plain Comision (empty grants)", async () => {
    await assertSucceeds(
      setDoc(doc(as("u", ["Admin"]), "positions/com_plain"), {
        title: "Comité de Conducta",
        sigla: "CC",
        category: "Comision",
        grants: [],
        term: null,
        description: "Ética.",
        active: true,
        deletedAt: null,
      }),
    );
  });
  it("denies flipping a power position to Comision while keeping its grants", async () => {
    await assertFails(
      updateDoc(doc(as("u", ["Admin"]), "positions/pos1"), { category: "Comision" }),
    );
  });
  it("BLOCKING: denies a non-Admin update:Position holder changing a position's category", async () => {
    // The escalation this closes, now that the members-positions lane exists: `grants` was
    // the only field pinned for a non-Admin, so an update:Position holder could retitle a
    // grant-free Comisión to { category: 'CEL', title: 'Presidente' } — boardRank 0 — and
    // then assign it to themselves on the public Directiva, with no Admin action anywhere.
    // category also decides board GROUP and whether comisionGrantsEmpty() applies at all.
    await assertFails(
      updateDoc(doc(as("orgchart-uid", [], ["update:Position"]), "positions/pos_cat"), {
        category: "CEL",
      }),
    );
    // The rest of the catalog stays writable for them — this pins one field, not the arm.
    await assertSucceeds(
      updateDoc(doc(as("orgchart-uid", [], ["update:Position"]), "positions/pos_cat"), {
        description: "Actualizada.",
      }),
    );
  });
  it("allows an Admin to change a position's category (the surviving authority)", async () => {
    await assertSucceeds(
      updateDoc(doc(as("admin-uid", ["Admin"]), "positions/pos_cat"), { category: "CEL" }),
    );
  });
  // Deliberate fail-closed: a legacy power comisión (possible before the
  // invariant) is client-unwritable — even soft-delete — until an admin-SDK/
  // console repair empties its grants. Documented in the design spec.
  it("locks a legacy power comisión until its grants are repaired via console", async () => {
    await assertFails(
      updateDoc(doc(as("u", ["Admin"]), "positions/com_legacy_power"), {
        active: false,
        deletedAt: new Date(),
      }),
    );
    await assertSucceeds(
      updateDoc(doc(as("u", ["Admin"]), "positions/com_legacy_power"), { grants: [] }),
    );
  });
  it("denies ExecutiveCommittee mutating grants on an existing position", async () => {
    await assertFails(
      updateDoc(doc(as("u", ["ExecutiveCommittee"]), "positions/pos1"), { grants: ["Admin"] }),
    );
  });
  it("denies ExecutiveCommittee updating even non-grants fields (manage:Position withdrawn)", async () => {
    await assertFails(
      updateDoc(doc(as("u", ["ExecutiveCommittee"]), "positions/pos1"), {
        description: "Actualizada.",
      }),
    );
  });
  it("denies ExecutiveCommittee soft-deleting a live position (manage:Position withdrawn)", async () => {
    await assertFails(
      updateDoc(doc(as("u", ["ExecutiveCommittee"]), "positions/pos_soft"), {
        active: false,
        deletedAt: new Date(),
      }),
    );
  });
  it("allows Admin to soft-delete a live position (the surviving authority)", async () => {
    await assertSucceeds(
      updateDoc(doc(as("admin-uid", ["Admin"]), "positions/pos_soft"), {
        active: false,
        deletedAt: new Date(),
      }),
    );
  });
  it("denies ExecutiveCommittee resurrecting a soft-deleted position", async () => {
    await assertFails(
      updateDoc(doc(as("u", ["ExecutiveCommittee"]), "positions/pos_deleted"), { active: true }),
    );
  });
});

describe("firestore.rules — activity parent-initiative direction", () => {
  it("lets the parent initiative's direction update a parented activity", async () => {
    await assertSucceeds(
      updateDoc(doc(as("owner-uid", ["Member"]), "activities/act_dir"), {
        photos: [
          {
            id: "ph1",
            url: "https://x/ph1.jpg",
            caption: null,
            uploadedAt: new Date("2026-06-12T00:00:00Z"),
            uploadedBy: "m_owner",
          },
        ],
      }),
    );
  });
  it("still lets Admin update a parented activity", async () => {
    await assertSucceeds(
      updateDoc(doc(as("u", ["Admin"]), "activities/act_dir"), { title: "Renombrada" }),
    );
  });
  it("denies a non-direction member updating a parented activity", async () => {
    await assertFails(
      updateDoc(doc(as("stranger", ["Member"]), "activities/act_dir"), { title: "Hack" }),
    );
  });
  it("denies a direction member updating a standalone activity (no parent direction)", async () => {
    await assertFails(
      updateDoc(doc(as("owner-uid", ["Member"]), "activities/act_standalone"), { title: "X" }),
    );
  });
});

describe("firestore.rules — initiative featured create-gate", () => {
  // Curation authority is the Admin/ProjectManager ROLE; a custom role holding only
  // the create perm may create initiatives but never born-featured ones.
  function asCustom(uid: string, perms: string[]) {
    return env.authenticatedContext(uid, { roles: ["Member"], perms }).firestore();
  }

  it("denies a custom create:Project holder creating featured:true", async () => {
    await assertFails(
      setDoc(doc(asCustom("cust-uid", ["create:Project"]), "projects/p_feat_c1"), {
        termId: "2026",
        title: "Colada",
        featured: true,
      }),
    );
  });
  it("denies a custom manage:Project holder creating featured:true", async () => {
    await assertFails(
      setDoc(doc(asCustom("cust-uid", ["manage:Project"]), "projects/p_feat_c2"), {
        termId: "2026",
        title: "Colada",
        featured: true,
      }),
    );
  });
  it("denies a custom create:Program holder creating featured:true", async () => {
    await assertFails(
      setDoc(doc(asCustom("cust-uid", ["create:Program"]), "programs/prog_feat_c1"), {
        termId: "2026",
        title: "Colada",
        featured: true,
      }),
    );
  });
  it("allows a custom create:Project holder creating featured:false", async () => {
    await assertSucceeds(
      setDoc(doc(asCustom("cust-uid", ["create:Project"]), "projects/p_feat_c3"), {
        termId: "2026",
        title: "Normal",
        featured: false,
      }),
    );
  });
  it("allows a custom create:Project holder creating without the field", async () => {
    await assertSucceeds(
      setDoc(doc(asCustom("cust-uid", ["create:Project"]), "projects/p_feat_c4"), {
        termId: "2026",
        title: "Normal",
      }),
    );
  });
  it("featured:false does not bypass the other create guards (parenthesization)", async () => {
    // Regression pin: if the featured arm ever loses its parens, `&& A || B`
    // re-associates and a featured:false create would skip every other guard.
    await assertFails(
      setDoc(doc(asCustom("cust-uid", ["create:Project"]), "projects/p_feat_c5"), {
        termId: "2026",
        title: "X",
        featured: false,
        status: "Finalizado",
      }),
    );
  });
  it("allows Admin creating featured:true", async () => {
    await assertSucceeds(
      setDoc(doc(as("u", ["Admin"]), "projects/p_feat_admin_create"), {
        termId: "2026",
        title: "Curada",
        featured: true,
      }),
    );
  });
  it("allows ProjectManager creating featured:true (program)", async () => {
    await assertSucceeds(
      setDoc(doc(as("u", ["ProjectManager"]), "programs/prog_feat_pm_create"), {
        termId: "2026",
        title: "Curada",
        featured: true,
      }),
    );
  });
});

// canCurateFeatured() is `hasAnyRole(['Admin']) || hasPerm('update:Showcase')`. Admin stays
// role-keyed (locked + undeactivatable, so its name carries no staleness); everyone else is
// perm-keyed, so DEACTIVATING a role now revokes curation — computeMemberRoles is pure over
// the trusted grants and reads no role doc, so the NAME survives a deactivation in the claim
// while the perms do not.
//
// Every test here targets a doc the principal can otherwise update (a direction uid, or an
// initiative update perm) and is paired with a non-featured write that SUCCEEDS, so a denial
// is the curation gate and never a missing update perm.
describe("firestore.rules — featured curation is perm-keyed (canCurateFeatured)", () => {
  it("denies a DEACTIVATED ProjectManager setting featured (stale role name in the claim)", async () => {
    // The whole point of D: roles claim still says ProjectManager, perms carry no
    // update:Showcase because the role doc is inactive. manage:Project comes from some
    // other live role, so the write clears every conjunct except the curation gate.
    const stale = as("pm-stale-uid", ["ProjectManager"], ["manage:Project"]);
    await assertFails(updateDoc(doc(stale, "projects/p_feat_deny_stale"), { featured: true }));
    await assertSucceeds(
      updateDoc(doc(stale, "projects/p_feat_deny_stale"), { title: "No destacable (PM inactivo)" }),
    );
  });

  it("denies a manage:all PERM holder with no Admin role setting featured", async () => {
    // manage:all is reachable as a perm without the Admin role (a custom role doc or a
    // permissionOverrides.grant can carry it — roleShapeValid() only requires a list). The
    // gate uses exact hasPerm, NOT canDo, so manage:all does not satisfy update:Showcase.
    const superPerm = as("mgr-all-uid", ["Member"], ["manage:all"]);
    await assertFails(updateDoc(doc(superPerm, "projects/p_feat_deny_mgrall"), { featured: true }));
    await assertSucceeds(
      updateDoc(doc(superPerm, "projects/p_feat_deny_mgrall"), {
        title: "No destacable (manage:all)",
      }),
    );
  });

  it("denies a manage:Showcase holder setting featured (the inert codes stay inert)", async () => {
    // The other five *:Showcase codes gate nothing. manage:Showcase is inert BECAUSE the
    // gate is exact hasPerm — there is no second, undocumented path to curation.
    const inert = as("mgr-showcase-uid", ["Member"], ["manage:Project", "manage:Showcase"]);
    await assertFails(updateDoc(doc(inert, "projects/p_feat_deny_inert"), { featured: true }));
    await assertSucceeds(
      updateDoc(doc(inert, "projects/p_feat_deny_inert"), {
        title: "No destacable (manage:Showcase)",
      }),
    );
  });

  it("allows a custom role holding update:Showcase to curate, with no Admin/PM role", async () => {
    await assertSucceeds(
      updateDoc(
        doc(
          as("cust-showcase-uid", ["Member"], ["update:Project", "update:Showcase"]),
          "projects/p_feat_showcase",
        ),
        {
          featured: true,
        },
      ),
    );
  });

  it("allows Admin with an EMPTY perms claim to curate (the role disjunct)", async () => {
    // Real shape: a member over PERMISSION_CAP gets perms:[] written while keeping
    // roles:['Admin']. The uid is a direction uid, so the update itself is allowed and the
    // only question left is curation authority.
    await assertSucceeds(
      updateDoc(doc(as("owner-uid", ["Admin"], []), "projects/p_feat_admin_role"), {
        featured: true,
      }),
    );
  });
});

describe("firestore.rules — activity lock (hasCheckIns)", () => {
  it("has a drift value for every field activityLockSafe() locks (no probe lags the rules)", () => {
    expect(RULES_LOCKED_FIELDS.length).toBeGreaterThan(0);
    expect(new Set(Object.keys(LOCKED_FIELD_DRIFT))).toEqual(new Set(RULES_LOCKED_FIELDS));
  });
  // One denied-update probe generated per field the rules actually lock — add a field to
  // activityLockSafe() and it is probed automatically (given a LOCKED_FIELD_DRIFT value).
  for (const field of RULES_LOCKED_FIELDS) {
    it(`denies Admin changing ${field} on a locked activity`, async () => {
      await assertFails(
        updateDoc(doc(as("u", ["Admin"]), "activities/act_locked"), {
          [field]: LOCKED_FIELD_DRIFT[field],
        }),
      );
    });
  }
  it("allows Admin editing title on a locked activity", async () => {
    await assertSucceeds(
      updateDoc(doc(as("u", ["Admin"]), "activities/act_locked"), { title: "Renombrada" }),
    );
  });
  it("allows an echo update resending unchanged locked fields", async () => {
    // The backstage mapper always sends the full editable field set.
    await assertSucceeds(
      updateDoc(doc(as("u", ["Admin"]), "activities/act_locked"), {
        category: "Assembly",
        startAt: LOCK_TS,
        parentType: null,
        parentId: null,
        title: "Bloqueada (echo)",
      }),
    );
  });
  it("allows category change while hasCheckIns is false", async () => {
    await assertSucceeds(
      updateDoc(doc(as("u", ["Admin"]), "activities/act_unlocked_flag"), { category: "Course" }),
    );
  });
  it("allows category change on a legacy doc without the flag", async () => {
    await assertSucceeds(
      updateDoc(doc(as("u", ["Admin"]), "activities/act1"), { category: "Course" }),
    );
  });
  it("denies client setting hasCheckIns:true on create (even Admin)", async () => {
    await assertFails(
      setDoc(doc(as("u", ["Admin"]), "activities/act_forge1"), {
        termId: "2026",
        category: "Assembly",
        hasCheckIns: true,
      }),
    );
  });
  it("denies client setting hasCheckIns:false on create (beacon-only field)", async () => {
    await assertFails(
      setDoc(doc(as("u", ["Admin"]), "activities/act_forge2"), {
        termId: "2026",
        category: "Assembly",
        hasCheckIns: false,
      }),
    );
  });
  it("denies client clearing hasCheckIns on update (even Admin)", async () => {
    await assertFails(
      updateDoc(doc(as("u", ["Admin"]), "activities/act_locked"), { hasCheckIns: false }),
    );
  });
  it("denies client removing hasCheckIns via deleteField", async () => {
    await assertFails(
      updateDoc(doc(as("u", ["Admin"]), "activities/act_unlocked_flag"), {
        hasCheckIns: deleteField(),
      }),
    );
  });
  it("lets the parent direction edit a locked activity while locked fields are untouched", async () => {
    await assertSucceeds(
      updateDoc(doc(as("owner-uid", ["Member"]), "activities/act_dir_locked"), {
        title: "Editada por dirección",
      }),
    );
  });
  it("denies the parent direction changing category on a locked activity", async () => {
    await assertFails(
      updateDoc(doc(as("owner-uid", ["Member"]), "activities/act_dir_locked"), {
        category: "Course",
      }),
    );
  });
});

describe("showcase (public read, beacon-only write)", () => {
  it("anyone (anon) can read", async () => {
    await assertSucceeds(getDoc(doc(anon(), "showcase/s1")));
  });
  it("signed-in member can read", async () => {
    await assertSucceeds(getDoc(doc(as("u", ["Member"]), "showcase/s1")));
  });
  it("anon cannot write", async () => {
    await assertFails(setDoc(doc(anon(), "showcase/s2"), { title: "x" }));
  });
  it("admin cannot write (beacon admin SDK only)", async () => {
    await assertFails(setDoc(doc(as("u", ["Admin"]), "showcase/s2"), { title: "x" }));
  });
});

describe("allyShowcase (public read, beacon-only write)", () => {
  it("allows anonymous read", async () => {
    await assertSucceeds(getDoc(doc(anon(), "allyShowcase/a1")));
  });
  it("denies anonymous write", async () => {
    await assertFails(setDoc(doc(anon(), "allyShowcase/a2"), { name: "x" }));
  });
  it("denies Admin write (beacon admin SDK only)", async () => {
    await assertFails(setDoc(doc(as("u", ["Admin"]), "allyShowcase/a2"), { name: "x" }));
  });
});

describe("boardShowcase (public read, beacon-only write)", () => {
  it("allows anonymous read", async () => {
    await assertSucceeds(getDoc(doc(anon(), "boardShowcase/b1")));
  });
  it("denies anonymous write", async () => {
    await assertFails(setDoc(doc(anon(), "boardShowcase/b2"), { name: "x" }));
  });
  it("denies Admin write (beacon admin SDK only)", async () => {
    await assertFails(setDoc(doc(as("u", ["Admin"]), "boardShowcase/b2"), { name: "x" }));
  });
});

describe("firestore.rules — member positions assignment", () => {
  it("denies ExecutiveCommittee assigning any cargo (the positions-only lane is gone)", async () => {
    // CEL used to have a dedicated hasOnly(['positions']) lane. It was deleted with
    // manage:Position; cargo assignment is Admin + manage:Member only, until PR 4's flag.
    await assertFails(
      updateDoc(doc(as("exec-uid", ["ExecutiveCommittee"]), "members/m1"), {
        positions: { [TERM]: { cargoId: "pos_soft", comisionIds: [], assignedBy: "exec-uid" } },
      }),
    );
  });
  it("allows Membership to assign a grant-free cargo with self assignedBy", async () => {
    await assertSucceeds(
      updateDoc(doc(as("mem-uid", ["Membership"]), "members/m1"), {
        positions: { [TERM]: { cargoId: "pos_soft", comisionIds: [], assignedBy: "mem-uid" } },
      }),
    );
  });
  // Named for what it actually asserts: `pos1` is a POWER cargo, so the power-conferral
  // guard denies this write for any non-Admin whether or not the CEL lane exists. The
  // load-bearing "CEL cannot assign ANY cargo" case is the grant-free `pos_soft` one above.
  it("denies ExecutiveCommittee assigning a power-conferring cargo", async () => {
    await assertFails(
      updateDoc(doc(as("exec-uid", ["ExecutiveCommittee"]), "members/m1"), {
        positions: { [TERM]: { cargoId: "pos1", comisionIds: [], assignedBy: "exec-uid" } },
      }),
    );
  });
  it("BLOCKING: denies Membership assigning a power-conferring cargo", async () => {
    await assertFails(
      updateDoc(doc(as("mem-uid", ["Membership"]), "members/m1"), {
        positions: { [TERM]: { cargoId: "pos1", comisionIds: [], assignedBy: "mem-uid" } },
      }),
    );
  });
  it("denies a forged assignedBy (not the caller's uid)", async () => {
    await assertFails(
      updateDoc(doc(as("admin-uid", ["Admin"]), "members/m1"), {
        positions: { [TERM]: { cargoId: "pos1", comisionIds: [], assignedBy: "someone-else" } },
      }),
    );
  });
  it("denies ExecutiveCommittee any member write, positions or otherwise", async () => {
    // The hasOnly(['positions']) lane was CEL's only member-write authority. With it gone,
    // read:Member is all they hold.
    await assertFails(
      updateDoc(doc(as("exec-uid", ["ExecutiveCommittee"]), "members/m1"), { name: "Hacked" }),
    );
  });
  it("still allows Membership to edit non-position fields without assignedBy", async () => {
    await assertSucceeds(
      updateDoc(doc(as("mem-uid", ["Membership"]), "members/m1"), { name: "Renamed" }),
    );
  });
  it("denies a forged assignedBy on the manage:Member path", async () => {
    await assertFails(
      updateDoc(doc(as("mem-uid", ["Membership"]), "members/m1"), {
        positions: { [TERM]: { cargoId: "pos_soft", comisionIds: [], assignedBy: "not-mem" } },
      }),
    );
  });
  it("BLOCKING: denies a non-current-term ride-along power cargo", async () => {
    // current term is safe (empty-grants, self), but a future term sneaks a power
    // cargo with a forged assignedBy — must be denied (only current term may change).
    await assertFails(
      updateDoc(doc(as("mem-uid", ["Membership"]), "members/m1"), {
        positions: {
          [TERM]: { cargoId: "pos_soft", comisionIds: [], assignedBy: "mem-uid" },
          "2099": { cargoId: "pos1", comisionIds: [], assignedBy: "someone-else" },
        },
      }),
    );
  });
  it("denies a member setting positions via the self update path", async () => {
    // members/m1.uid === "owner-uid"; the self rule only allows profilePicture.
    await assertFails(
      updateDoc(doc(as("owner-uid", ["Member"]), "members/m1"), {
        positions: { [TERM]: { cargoId: "pos_soft", comisionIds: [], assignedBy: "owner-uid" } },
      }),
    );
  });
  it("allows a non-Admin to assign a power-conferring comisión (rules pass; beacon trust gate drops the grant)", async () => {
    // INTENTIONAL: rules cannot iterate comisionIds, so comisión grants are NOT
    // gated here. The beacon onMemberWritten trust gate honors comisión power
    // grants only when assignedBy is an Admin (see apps/beacon claims-sync).
    // Membership, not ExecutiveCommittee: CEL no longer has a member-write lane at all,
    // so an EC context would pass this test for the wrong reason.
    await assertSucceeds(
      updateDoc(doc(as("mem-uid", ["Membership"]), "members/m1"), {
        positions: { [TERM]: { cargoId: null, comisionIds: ["pos1"], assignedBy: "mem-uid" } },
      }),
    );
  });
  it("denies a non-Admin assigning a dangling cargoId (get() on missing position fails closed)", async () => {
    await assertFails(
      updateDoc(doc(as("mem-uid", ["Membership"]), "members/m1"), {
        positions: { [TERM]: { cargoId: "pos_ghost", comisionIds: [], assignedBy: "mem-uid" } },
      }),
    );
  });
  it("allows the production dot-path write shape (Membership, current term, grant-free cargo)", async () => {
    // setPositions / toMemberUpdateDoc emit positions.<term> dot-paths, not a full
    // positions map — assert that exact production shape passes the rules.
    await assertSucceeds(
      updateDoc(doc(as("mem-uid", ["Membership"]), "members/m1"), {
        [`positions.${TERM}`]: { cargoId: "pos_soft", comisionIds: [], assignedBy: "mem-uid" },
      }),
    );
  });
  it("denies the dot-path shape under a non-current term (past-term immutability)", async () => {
    await assertFails(
      updateDoc(doc(as("mem-uid", ["Membership"]), "members/m1"), {
        "positions.2099": { cargoId: "pos_soft", comisionIds: [], assignedBy: "mem-uid" },
      }),
    );
  });
  // ── The members-positions lane: canDo('update','Position') + hasOnly(['positions']) ──
  // A perms-only principal with NO built-in role name — the custom role owner-op 1
  // describes. `as(uid, [], [...])` is what makes it perms-only: the third argument
  // replaces the seeded role perms entirely.
  const ORG_CHART = "orgchart-uid";
  const orgChart = () => as(ORG_CHART, [], ["update:Position"]);

  it("allows an update:Position-only principal to assign a grant-free cargo, self-stamped", async () => {
    await assertSucceeds(
      updateDoc(doc(orgChart(), "members/m_positions"), {
        [`positions.${TERM}`]: { cargoId: "pos_soft", comisionIds: [], assignedBy: ORG_CHART },
      }),
    );
  });

  it("BLOCKING: denies the update:Position lane assigning a power-conferring cargo (new side)", async () => {
    // positionsAssignmentSafe() is reused verbatim: its non-Admin branch demands
    // cargoGrantsEmpty(), and pos1 grants Treasury. Without it this lane would mint claims.
    await assertFails(
      updateDoc(doc(orgChart(), "members/m_positions"), {
        [`positions.${TERM}`]: { cargoId: "pos1", comisionIds: [], assignedBy: ORG_CHART },
      }),
    );
  });

  it("BLOCKING: denies the update:Position lane replacing a power cargo with a grant-free one (old side)", async () => {
    // The de-elevation attack from the OTHER direction: m_powercargo holds pos1, so only
    // currentCargoGrantsEmpty() — the old-side half — stops this lane from stripping a
    // claim. assertFails, so m_powercargo stays intact for the C1 describe below.
    await assertFails(
      updateDoc(doc(orgChart(), "members/m_powercargo"), {
        [`positions.${TERM}`]: { cargoId: "pos_soft", comisionIds: [], assignedBy: ORG_CHART },
      }),
    );
  });

  it("BLOCKING: denies the update:Position lane touching any non-positions field in the same write", async () => {
    // hasOnly(['positions']) is what confines this lane to the org chart. A ride-along
    // `name` (or roleIds, or totalPoints) must drop the whole write off the arm.
    await assertFails(
      updateDoc(doc(orgChart(), "members/m_positions"), {
        name: "Renombrado",
        [`positions.${TERM}`]: { cargoId: "pos_soft", comisionIds: [], assignedBy: ORG_CHART },
      }),
    );
  });

  it("denies the update:Position lane a forged assignedBy", async () => {
    await assertFails(
      updateDoc(doc(orgChart(), "members/m_positions"), {
        [`positions.${TERM}`]: { cargoId: "pos_soft", comisionIds: [], assignedBy: "admin-uid" },
      }),
    );
  });

  it("denies the update:Position lane a non-current-term write", async () => {
    await assertFails(
      updateDoc(doc(orgChart(), "members/m_positions"), {
        "positions.2099": { cargoId: "pos_soft", comisionIds: [], assignedBy: ORG_CHART },
      }),
    );
  });

  it("denies the update:Position lane creating a member (create stays canDo('create','Member'))", async () => {
    // createPositionsSafe() cannot call currentCargoGrantsEmpty() — a create has no prior
    // resource — and there is no old side to protect, so creation was deliberately not
    // widened. An org-chart editor may not mint member records.
    await assertFails(
      setDoc(doc(orgChart(), "members/m_orgchart_new"), {
        name: "Nuevo",
        totalPoints: 0,
        active: true,
        deletedAt: null,
        positions: { [TERM]: { cargoId: "pos_soft", comisionIds: [], assignedBy: ORG_CHART } },
      }),
    );
  });

  it("denies the update:Position lane wiping the current term — whole-map replacement and deleteField", async () => {
    // Both currently deny via assignedBySelf(): a positions map with no current-term key
    // reads assignedBy '' != uid. That is INCIDENTAL — nothing else in the arm asks whether
    // an assignment was removed — so pin it, or a future refactor of assignedBySelf() drops
    // the clear-a-cargo guard without a red test.
    await assertFails(updateDoc(doc(orgChart(), "members/m_positions"), { positions: {} }));
    await assertFails(
      updateDoc(doc(orgChart(), "members/m_positions"), { positions: deleteField() }),
    );
  });

  it("ACCEPTED EXPOSURE: an update:Position holder may put a member — including itself — on the public Directiva", async () => {
    // Deliberate, not an oversight (see docs/specs/position-assignment-lane.md, section A).
    // pos_soft is a JDL dirección with grants: [], and boardGroupFromCategory publishes both
    // CEL and JDL, so this write lands on the world-readable boardShowcase projection. It is
    // not privilege escalation — resolveTrustedGrants returns early on grants.length === 0,
    // so no claim is minted — but it IS a publication authority, and owner-op 1 says so in
    // the same words. Seeded CEL cargos all carry non-empty grants, so those stay Admin-only.
    await assertSucceeds(
      updateDoc(doc(orgChart(), "members/m_orgchart"), {
        [`positions.${TERM}`]: { cargoId: "pos_soft", comisionIds: [], assignedBy: ORG_CHART },
      }),
    );
  });

  // LAST in this block on purpose: the suite seeds once and never resets, and this write
  // leaves members/m1 holding a power cargo. A Membership success case running after it
  // would be denied by currentCargoGrantsEmpty() — the C1 guard — not by its own subject.
  it("allows Admin to assign a power-conferring cargo", async () => {
    await assertSucceeds(
      updateDoc(doc(as("admin-uid", ["Admin"]), "members/m1"), {
        positions: { [TERM]: { cargoId: "pos1", comisionIds: [], assignedBy: "admin-uid" } },
      }),
    );
  });
});

describe("firestore.rules — replacing an already-assigned power cargo (C1)", () => {
  it("BLOCKING: denies Membership replacing an Admin-granting cargo with a grant-free one", async () => {
    // The de-elevation attack: the NEW cargo is grant-free, so the old cargoGrantsEmpty()
    // check passed. currentCargoGrantsEmpty() is what looks at resource.data — the cargo
    // being displaced — and denies the write.
    await assertFails(
      updateDoc(doc(as("mem-uid", ["Membership"]), "members/m_powercargo"), {
        [`positions.${TERM}`]: { cargoId: "pos_soft", comisionIds: [], assignedBy: "mem-uid" },
      }),
    );
  });

  it("BLOCKING: denies Membership clearing an Admin-granting cargo to null", async () => {
    // cargoId: null makes cargoGrantsEmpty() short-circuit true; only the old-side guard
    // catches it.
    await assertFails(
      updateDoc(doc(as("mem-uid", ["Membership"]), "members/m_powercargo"), {
        [`positions.${TERM}`]: { cargoId: null, comisionIds: [], assignedBy: "mem-uid" },
      }),
    );
  });

  it("allows Admin to replace a power cargo (the legitimate hand-over)", async () => {
    await assertSucceeds(
      updateDoc(doc(as("admin-uid", ["Admin"]), "members/m_powercargo"), {
        [`positions.${TERM}`]: { cargoId: "pos_soft", comisionIds: [], assignedBy: "admin-uid" },
      }),
    );
  });
});

// B: the four softDeleteSafe() lanes (members ×2 + the positions lane, positions, allies)
// gained the same well-formedness prefix roleLifecycleSafe() already had, and their three
// create arms gained the born-live requirement the roles create arm already had.
//
// The two halves are inseparable on purpose: the create arms stop new malformed docs, the
// prefix stops client writes onto the ones already stored. Neither repairs anything — the
// remedy for an existing malformed doc is the console, the admin SDK, or (for publication
// specifically) the Admin takedown arm, which deliberately does NOT call softDeleteSafe()
// and is pinned open at the bottom of this block.
describe("firestore.rules — soft-delete well-formedness (B)", () => {
  const secretary = () => as("sec-uid", ["Secretary"]);

  it("denies creating a member with no active/deletedAt (the bare legacy shape)", async () => {
    // Same payload as "allows Membership to create with totalPoints 0" minus BORN_LIVE —
    // so this isolates the new create conjuncts and nothing else.
    await assertFails(
      setDoc(doc(as("u", ["Membership"]), "members/new_bare"), {
        name: "Bruno Paz",
        totalPoints: 0,
      }),
    );
  });
  it("denies creating a position with no active/deletedAt", async () => {
    await assertFails(
      setDoc(doc(as("admin-uid", ["Admin"]), "positions/new_bare"), {
        title: "Director de Finanzas",
        titleFemale: "Directora de Finanzas",
        category: "JDL",
        grants: [],
        term: 2026,
        description: "Finanzas.",
      }),
    );
  });
  it("denies creating an ally with no active/deletedAt", async () => {
    await assertFails(
      setDoc(doc(secretary(), "allies/a_bare"), { companyName: "Sin ciclo de vida" }),
    );
  });

  it("denies a member born soft-deleted (active false / deletedAt already stamped)", async () => {
    // A doc born dead is invisible to every list yet occupies its id; a doc born with a
    // deletedAt is the ghost shape (live to a `where`, dead to the pipeline). Neither is a
    // state any client flow produces, so neither is client-creatable.
    await assertFails(
      setDoc(doc(as("u", ["Membership"]), "members/new_born_dead"), {
        name: "Bruno Paz",
        totalPoints: 0,
        active: false,
        deletedAt: null,
      }),
    );
    await assertFails(
      setDoc(doc(as("u", ["Membership"]), "members/new_born_ghost"), {
        name: "Bruno Paz",
        totalPoints: 0,
        active: true,
        deletedAt: DELETED_AT,
      }),
    );
  });
  it("denies a position born soft-deleted or born with a deletedAt", async () => {
    const born = (extra: Record<string, unknown>) => ({
      title: "Director de Finanzas",
      titleFemale: "Directora de Finanzas",
      category: "JDL",
      grants: [],
      term: 2026,
      description: "Finanzas.",
      ...extra,
    });
    await assertFails(
      setDoc(
        doc(as("admin-uid", ["Admin"]), "positions/new_born_dead"),
        born({ active: false, deletedAt: null }),
      ),
    );
    await assertFails(
      setDoc(
        doc(as("admin-uid", ["Admin"]), "positions/new_born_ghost"),
        born({ active: true, deletedAt: DELETED_AT }),
      ),
    );
  });
  it("denies an ally born soft-deleted or born with a deletedAt", async () => {
    await assertFails(
      setDoc(doc(secretary(), "allies/a_born_dead"), {
        companyName: "Nacida muerta",
        active: false,
        deletedAt: null,
      }),
    );
    await assertFails(
      setDoc(doc(secretary(), "allies/a_born_ghost"), {
        companyName: "Fantasma",
        active: true,
        deletedAt: DELETED_AT,
      }),
    );
  });

  // The stored-side half. A non-bool `active` is the exact ghost this change exists for: it
  // is dropped by the zod doc schemas (invisible in backstage) while every `!== false` /
  // `!= null` reader treats it as live — which is how it reached the public Directiva.
  it("denies every client update to a member whose stored active is a non-bool", async () => {
    await assertFails(
      updateDoc(doc(as("u", ["Membership"]), "members/m_badactive"), { profession: "Arquitecta" }),
    );
    await assertFails(
      updateDoc(doc(as("admin-uid", ["Admin"]), "members/m_badactive"), { name: "Hilda Paz" }),
    );
    // The members-positions lane (A) calls softDeleteSafe() too — all four lanes close
    // together, which is the point of putting the check in the helper.
    await assertFails(
      updateDoc(doc(as("orgchart-uid", [], ["update:Position"]), "members/m_badactive"), {
        [`positions.${TERM}`]: {
          cargoId: "pos_soft",
          comisionIds: [],
          assignedBy: "orgchart-uid",
        },
      }),
    );
  });
  it("denies every client update to a position whose stored active is a non-bool", async () => {
    await assertFails(
      updateDoc(doc(as("admin-uid", ["Admin"]), "positions/pos_badactive"), { title: "Vocal" }),
    );
    await assertFails(
      updateDoc(doc(as("orgchart-uid", [], ["update:Position"]), "positions/pos_badactive"), {
        title: "Vocal",
      }),
    );
  });
  it("denies every client update to an ally whose stored active is a non-bool", async () => {
    await assertFails(
      updateDoc(doc(secretary(), "allies/a_badactive"), { companyName: "Reparada" }),
    );
    await assertFails(
      updateDoc(doc(as("admin-uid", ["Admin"]), "allies/a_badactive"), {
        companyName: "Reparada",
      }),
    );
  });

  it("denies updating a member whose stored doc has no active key", async () => {
    await assertFails(
      updateDoc(doc(as("u", ["Membership"]), "members/m_noactive"), { profession: "Bióloga" }),
    );
  });
  it("denies updating a member whose stored doc has no deletedAt key", async () => {
    await assertFails(
      updateDoc(doc(as("u", ["Membership"]), "members/m_nodeletedat"), { profession: "Biólogo" }),
    );
    // active: true is well-formed here, so the self lane's own `active == true` check passes
    // and the missing deletedAt is the only thing denying — the /me lane is closed too.
    await assertFails(
      updateDoc(doc(as("nodeletedat-uid", ["Member"]), "members/m_nodeletedat"), {
        profession: "Biólogo",
      }),
    );
  });
  it("pins which malformed field a client can repair and which it cannot", async () => {
    // Stated so nobody reads the denials above as "just write the right value". The two
    // halves differ, and the difference is exactly why owner-op 4 is a console/admin-SDK
    // audit rather than a UI affordance:
    //   active   — NOT client-repairable. The one-way half demands
    //              resource.data.active == true || unchanged('active'), and a stored
    //              non-bool satisfies neither once the write changes it.
    //   deletedAt — client-repairable by stamping the null the doc should have had:
    //              unchanged('deletedAt') reads .get(…, null) on both sides, so
    //              absent -> null is a no-op to the one-way half and the merged doc then
    //              carries the key. A missing deletedAt is therefore self-healing; a
    //              malformed active is not.
    await assertFails(
      updateDoc(doc(as("admin-uid", ["Admin"]), "members/m_badactive"), { active: true }),
    );
    await assertSucceeds(
      updateDoc(doc(as("u", ["Membership"]), "members/m_nodeletedat_fix"), { deletedAt: null }),
    );
  });

  it("keeps the Admin takedown arm open on a malformed member (the remedy path)", async () => {
    // The single most important assertion in this block. The takedown arm deliberately does
    // not call softDeleteSafe(), so it is the ONE rules-level path that can unpublish
    // exactly the malformed member this change is about. Moving the well-formedness check
    // onto the arms instead of into the helper would have removed the remedy with the
    // disease.
    await assertSucceeds(
      updateDoc(doc(as("admin-uid", ["Admin"]), "members/m_badactive"), { publicProfile: false }),
    );
  });

  it("leaves the /me self lane working on an ordinary well-formed member", async () => {
    // The merge half: on an update request.resource.data is the MERGED doc, so a write that
    // touches neither field still satisfies the prefix when the stored doc is well-formed.
    // Without this the prefix would have locked every member out of their own profile.
    await assertSucceeds(
      updateDoc(doc(as("carlos-uid", ["Member"]), "members/m_positions"), {
        profession: "Ingeniero",
      }),
    );
  });
});

describe("firestore.rules — roles collection", () => {
  const ROLE_DOC = {
    name: "Coordinador",
    description: "",
    builtIn: false,
    builtInKey: null,
    permissions: ["manage:Position"],
    locked: false,
    active: true,
    deletedAt: null,
  };

  it("allows any signed-in user to read role definitions", async () => {
    await assertSucceeds(getDoc(doc(as("u", ["Member"]), "roles/Admin")));
  });
  it("denies anonymous reads of role definitions", async () => {
    await assertFails(getDoc(doc(anon(), "roles/Admin")));
  });
  it("allows Admin to create a custom role", async () => {
    await assertSucceeds(setDoc(doc(as("admin-uid", ["Admin"]), "roles/custom1"), ROLE_DOC));
  });
  it("denies a non-Admin (Membership) creating a role", async () => {
    await assertFails(setDoc(doc(as("mem-uid", ["Membership"]), "roles/custom2"), ROLE_DOC));
  });
  it("BLOCKING: denies a client creating a role that spoofs a built-in key", async () => {
    await assertFails(
      setDoc(doc(as("admin-uid", ["Admin"]), "roles/impostor"), {
        ...ROLE_DOC,
        builtIn: true,
        builtInKey: "Treasury",
        permissions: ["manage:all"],
      }),
    );
  });
  it("BLOCKING: denies creating a role that omits `active`", async () => {
    // where("active","==",true) can't match it and roleDefinitionDocSchema rejects it,
    // so /permisos never shows it — yet isActiveRoleDoc calls it ACTIVE and
    // getRolesByIds mints its permissions to any member naming it in roleIds. A live
    // manage:all role invisible on the page whose job is to show exactly that.
    await assertFails(
      setDoc(doc(as("admin-uid", ["Admin"]), "roles/no_active"), {
        name: "Sin active",
        description: "",
        builtIn: false,
        builtInKey: null,
        permissions: ["manage:all"],
        locked: false,
        deletedAt: null,
      }),
    );
  });
  it("BLOCKING: denies creating a role that omits deletedAt", async () => {
    await assertFails(
      setDoc(doc(as("admin-uid", ["Admin"]), "roles/no_deleted_at"), {
        name: "Sin deletedAt",
        description: "",
        builtIn: false,
        builtInKey: null,
        permissions: ["read:Position"],
        locked: false,
        active: true,
      }),
    );
  });
  it("BLOCKING: denies the born-invisible create — no name, no description, no locked", async () => {
    // The create arm read `locked` through `.get('locked', false)`, so an OMITTED `locked`
    // satisfied it and roleIdentityUnchanged() then pinned it absent forever. Nothing
    // constrained `name`/`description` at all. This exact payload therefore created a doc
    // that roleDefinitionDocSchema rejects (parseDocs drops it, /permisos never shows it)
    // while getRolesByIds mints manage:all to any member naming it in roleIds.
    await assertFails(
      setDoc(doc(as("admin-uid", ["Admin"]), "roles/born_invisible"), {
        builtIn: false,
        builtInKey: null,
        active: true,
        deletedAt: null,
        permissions: ["manage:all"],
      }),
    );
  });
  it("BLOCKING: denies creating a role whose name is not a string", async () => {
    await assertFails(
      setDoc(doc(as("admin-uid", ["Admin"]), "roles/create_bad_name"), {
        ...ROLE_DOC,
        name: 42,
        permissions: ["manage:all"],
      }),
    );
  });
  it("denies creating a role with an empty name", async () => {
    // Mirrors roleDefinitionSchema's name.min(1) — the write schema the admin form uses.
    await assertFails(
      setDoc(doc(as("admin-uid", ["Admin"]), "roles/create_empty_name"), {
        ...ROLE_DOC,
        name: "",
      }),
    );
  });
  it("denies creating a role with an over-long name", async () => {
    await assertFails(
      setDoc(doc(as("admin-uid", ["Admin"]), "roles/create_long_name"), {
        ...ROLE_DOC,
        name: "x".repeat(101),
      }),
    );
  });
  it("BLOCKING: denies creating a role whose description is not a string", async () => {
    await assertFails(
      setDoc(doc(as("admin-uid", ["Admin"]), "roles/create_bad_desc"), {
        ...ROLE_DOC,
        description: 42,
      }),
    );
  });
  it("BLOCKING: denies creating a role whose permissions is not a list", async () => {
    await assertFails(
      setDoc(doc(as("admin-uid", ["Admin"]), "roles/create_bad_perms"), {
        ...ROLE_DOC,
        permissions: "manage:all",
      }),
    );
  });
  it("BLOCKING: denies a create that OMITS locked — well-formed in every other field", async () => {
    // The isolating payload for roleShapeValid()'s `('locked' in d)`/`locked is bool` PAIR:
    // everything else is valid, so nothing but those two can deny it. Not `('locked' in d)`
    // alone — per the sweep table in firestore.rules, neutralizing it leaves `locked is bool`
    // ERRORING on the absent key, which still denies. The pair is the guard; neither half is
    // individually falsifiable. The old arm read `locked` through
    // `.get('locked', false)`, which an omission satisfies, and roleIdentityUnchanged()
    // then pinned the field absent forever — a doc roleDefinitionDocSchema rejects
    // (locked: z.boolean()) is dropped by parseDocs and invisible on /permisos, while
    // getRolesByIds mints its permissions to any member naming it in roleIds.
    await assertFails(
      setDoc(doc(as("admin-uid", ["Admin"]), "roles/create_no_locked"), {
        name: "Sin locked",
        description: "",
        builtIn: false,
        builtInKey: null,
        permissions: ["manage:all"],
        active: true,
        deletedAt: null,
      }),
    );
  });
  it("denies creating an already-deactivated role", async () => {
    await assertFails(
      setDoc(doc(as("admin-uid", ["Admin"]), "roles/born_dead"), {
        ...ROLE_DOC,
        active: false,
        deletedAt: serverTimestamp(),
      }),
    );
  });
  it("denies creating a role with active:true and deletedAt set", async () => {
    await assertFails(
      setDoc(doc(as("admin-uid", ["Admin"]), "roles/born_ghost"), {
        ...ROLE_DOC,
        deletedAt: serverTimestamp(),
      }),
    );
  });
  it("allows Admin to edit a custom role's permissions", async () => {
    await assertSucceeds(
      updateDoc(doc(as("admin-uid", ["Admin"]), "roles/custom_existing"), {
        permissions: ["read:Position", "manage:Ally"],
      }),
    );
  });
  it("allows Admin to edit a non-locked built-in role's permissions", async () => {
    await assertSucceeds(
      updateDoc(doc(as("admin-uid", ["Admin"]), "roles/Treasury"), {
        permissions: ["read:Member"],
      }),
    );
  });
  it("denies a non-Admin updating a role", async () => {
    await assertFails(
      updateDoc(doc(as("mem-uid", ["Membership"]), "roles/custom_existing"), {
        permissions: ["manage:all"],
      }),
    );
  });
  it("BLOCKING: denies editing the locked Admin role", async () => {
    await assertFails(
      updateDoc(doc(as("admin-uid", ["Admin"]), "roles/Admin"), { permissions: ["read:Member"] }),
    );
  });
  it("denies changing a role's identity fields (builtInKey)", async () => {
    await assertFails(
      updateDoc(doc(as("admin-uid", ["Admin"]), "roles/custom_existing"), {
        builtInKey: "Treasury",
      }),
    );
  });
  // REPLACES "denies deactivating a built-in role (would restore seed perms via the
  // trigger)". That test stood in for the invariant "an inactive built-in must not
  // restore its seed perms", which now lives in the beacon three-way
  // (apps/beacon/src/claims-sync/resolve-member-perms.test.ts + role-docs.emulator.test.ts).
  // Both halves need a test or the guard evaporates: there, that inactive means zero
  // perms; here, that deactivation is permitted at all.
  it("allows Admin to deactivate a non-locked built-in role", async () => {
    await assertSucceeds(
      updateDoc(doc(as("admin-uid", ["Admin"]), "roles/Membership"), {
        active: false,
        deletedAt: serverTimestamp(),
      }),
    );
  });
  it("allows Admin to reactivate a deactivated built-in role", async () => {
    // softDeleteSafe() hard-blocks active:false -> true, which is why the roles lane
    // uses roleLifecycleSafe() instead. softDeleteSafe() has since gained this function's
    // WELL-FORMEDNESS prefix (active present and a bool, deletedAt present) — see the
    // "soft-delete well-formedness (B)" block above. What must not change is its ONE-WAY
    // semantics: four other lanes depend on them and member resurrection is pinned denied
    // by "denies resurrecting a soft-deleted member" above. The coupling half below
    // (active == true => deletedAt == null) is still roles-only.
    await assertSucceeds(
      updateDoc(doc(as("admin-uid", ["Admin"]), "roles/inactive_builtin"), {
        active: true,
        deletedAt: null,
      }),
    );
  });
  it("BLOCKING: denies deactivating the Member role", async () => {
    // computeMemberRoles injects "Member" into every claim unconditionally
    // (compute-roles.ts:9), so this strips five reads from the whole chapter and the
    // restore is a second unbounded members scan. An admin who wants that outcome
    // empties its `permissions` instead. `locked` protects roles/Admin only.
    await assertFails(
      updateDoc(doc(as("admin-uid", ["Admin"]), "roles/Member"), {
        active: false,
        deletedAt: serverTimestamp(),
      }),
    );
  });
  it("BLOCKING: denies deactivating the locked Admin role", async () => {
    await assertFails(
      updateDoc(doc(as("admin-uid", ["Admin"]), "roles/Admin"), {
        active: false,
        deletedAt: serverTimestamp(),
      }),
    );
  });
  it("BLOCKING: denies deleteField('active') — a ghost role, invisible in the UI but live in the pipeline", async () => {
    // roleDefinitionDocSchema requires active: z.boolean(), so parseDocs drops the doc
    // and /permisos cannot show or restore it; beacon's isActiveRoleDoc reads
    // `active !== false`, so it keeps minting perms forever.
    await assertFails(
      updateDoc(doc(as("admin-uid", ["Admin"]), "roles/ghost_probe"), { active: deleteField() }),
    );
  });
  it("BLOCKING: denies a non-bool active", async () => {
    await assertFails(
      updateDoc(doc(as("admin-uid", ["Admin"]), "roles/ghost_probe"), { active: "false" }),
    );
  });
  it("BLOCKING: denies a non-bool active even with a well-formed deletedAt", async () => {
    // The payload that isolates `d.active is bool`: the case above is also caught by the
    // active<->deletedAt coupling (a string active takes the else branch, where the
    // unchanged null deletedAt fails), so on its own it would pass with `is bool` deleted.
    // With a real deletedAt the else branch is satisfied and `is bool` is the ONLY
    // conjunct left standing — and this is the dangerous payload: isActiveRoleDoc reads
    // `active !== false`, so the string "false" is LIVE in the perms pipeline while
    // roleDefinitionDocSchema's z.boolean() makes the doc invisible on /permisos.
    await assertFails(
      updateDoc(doc(as("admin-uid", ["Admin"]), "roles/ghost_probe"), {
        active: "false",
        deletedAt: serverTimestamp(),
      }),
    );
  });
  it("BLOCKING: denies a string deletedAt — invisible in the UI, dead in the pipeline, no path back", async () => {
    await assertFails(
      updateDoc(doc(as("admin-uid", ["Admin"]), "roles/ghost_probe"), {
        active: false,
        deletedAt: "2026-01-01",
      }),
    );
  });
  it("BLOCKING: denies active:true with deletedAt set — assignable everywhere, mints nothing", async () => {
    // Live to getAll()'s where("active","==",true), dead to isActiveRoleDoc, and for a
    // built-in also COVERED, so the seed fallback silently vanishes too.
    await assertFails(
      updateDoc(doc(as("admin-uid", ["Admin"]), "roles/ghost_probe"), {
        active: true,
        deletedAt: serverTimestamp(),
      }),
    );
  });
  it("denies a deactivation whose deletedAt is not request.time (audit hygiene)", async () => {
    await assertFails(
      updateDoc(doc(as("admin-uid", ["Admin"]), "roles/ghost_probe"), {
        active: false,
        deletedAt: Timestamp.fromDate(DELETED_AT),
      }),
    );
  });
  it("denies clearing deletedAt while leaving active false", async () => {
    await assertFails(
      updateDoc(doc(as("admin-uid", ["Admin"]), "roles/ghost_probe"), {
        active: false,
        deletedAt: null,
      }),
    );
  });
  it("denies a non-Admin deactivating a role", async () => {
    await assertFails(
      updateDoc(doc(as("mem-uid", ["Membership"]), "roles/custom_existing"), {
        active: false,
        deletedAt: serverTimestamp(),
      }),
    );
  });
  it("BLOCKING: denies an update whose name is not a string — invisible on /permisos, live in the pipeline", async () => {
    // The headline hole roleShapeValid() closes. This write passed every conjunct the
    // lane had: Admin, not locked, identity untouched, active/deletedAt well-formed. The
    // doc then failed roleDefinitionDocSchema's name: z.string(), so parseDocs DROPPED it
    // and /permisos re-rendered the role through its `unsynced` branch showing the SEED
    // perms — while getRoleDocsByBuiltInKeys read it as active and minted the doc's REAL
    // manage:all to every holder. Invisible on the page whose job is to show exactly that.
    await assertFails(
      updateDoc(doc(as("admin-uid", ["Admin"]), "roles/ghost_probe"), {
        name: 42,
        permissions: ["manage:all"],
      }),
    );
  });
  it("denies an update that empties the name", async () => {
    await assertFails(
      updateDoc(doc(as("admin-uid", ["Admin"]), "roles/ghost_probe"), { name: "" }),
    );
  });
  it("denies an update with an over-long name", async () => {
    await assertFails(
      updateDoc(doc(as("admin-uid", ["Admin"]), "roles/ghost_probe"), { name: "x".repeat(101) }),
    );
  });
  it("denies deleteField('name') — the UI cannot render or repair a nameless role", async () => {
    await assertFails(
      updateDoc(doc(as("admin-uid", ["Admin"]), "roles/ghost_probe"), { name: deleteField() }),
    );
  });
  it("BLOCKING: denies an update whose description is not a string", async () => {
    await assertFails(
      updateDoc(doc(as("admin-uid", ["Admin"]), "roles/ghost_probe"), { description: 42 }),
    );
  });
  it("BLOCKING: denies an update whose permissions is not a list", async () => {
    // z.array() rejects a scalar, so the doc vanishes from /permisos while beacon still
    // reads whatever it can off the raw doc.
    await assertFails(
      updateDoc(doc(as("admin-uid", ["Admin"]), "roles/ghost_probe"), {
        permissions: "manage:all",
      }),
    );
  });
  it("denies deleteField('permissions')", async () => {
    await assertFails(
      updateDoc(doc(as("admin-uid", ["Admin"]), "roles/ghost_probe"), {
        permissions: deleteField(),
      }),
    );
  });
  it("BLOCKING: denies deactivating an Admin-keyed role whose locked is FALSE", async () => {
    // Anti-lockout must be structural, not prose. `locked: true` is the intended guard, but
    // prod role docs are documented as lagging the seed, so the spec previously converted
    // this into a manual pre-deploy check with nothing behind it. If prod's roles/Admin has
    // `locked` missing or false, this one write strips manage:all chapter-wide through the
    // unbounded, no-retry members fan-out — and neither seed callable can heal it
    // (seedBuiltInRoles is create-only, reseedBuiltInRolePerms skips inactive docs).
    await assertFails(
      updateDoc(doc(as("admin-uid", ["Admin"]), "roles/admin_unlocked"), {
        active: false,
        deletedAt: serverTimestamp(),
      }),
    );
  });
  it("allows editing that same unlocked Admin-keyed role's permissions (non-vacuity twin)", async () => {
    // Proves the deny above is roleDeactivationAllowed()'s Admin arm biting, not the locked
    // guard or the whole lane. Touches `permissions` only — disjoint from the builtInKey /
    // locked / active fields the deny reads, so sharing the fixture is order-safe.
    await assertSucceeds(
      updateDoc(doc(as("admin-uid", ["Admin"]), "roles/admin_unlocked"), {
        permissions: ["manage:all", "read:Member"],
      }),
    );
  });
  it("allows Admin to edit an inactive role's permissions without re-stamping deletedAt", async () => {
    // Design 4 depends on this: an inactive role's stored `permissions` is "real,
    // editable", and is what "Reactivar rol" mints to every holder at once. But
    // RoleRepository.update writes name/description/permissions ONLY, so a
    // `deletedAt == request.time` requirement on every inactive-state write would deny
    // the whole editor for a deactivated role. The inactive branch therefore accepts an
    // UNCHANGED deletedAt as well; the deactivating transition (null -> value) still
    // cannot satisfy unchanged() and stays pinned to request.time.
    await assertSucceeds(
      updateDoc(doc(as("admin-uid", ["Admin"]), "roles/inactive_editable"), {
        name: "Sonda inactiva II",
        permissions: ["read:Position", "manage:Ally"],
      }),
    );
  });
  it("allows re-stamping deletedAt on an already-inactive role", async () => {
    // RoleEditor.canDelete relies on this being permitted (hence its `role.active`
    // conjunct, so a deactivated role does not offer "Desactivar rol" again).
    await assertSucceeds(
      updateDoc(doc(as("admin-uid", ["Admin"]), "roles/inactive_editable"), {
        active: false,
        deletedAt: serverTimestamp(),
      }),
    );
  });
  it("allows Admin to rename a non-locked built-in role", async () => {
    // PR 1's headline behavior, previously unguarded: the rules suite only covered
    // `permissions`. RoleRepository.update writes name/description/permissions, so the
    // name lane needs its own pin.
    await assertSucceeds(
      updateDoc(doc(as("admin-uid", ["Admin"]), "roles/Treasury"), {
        name: "Finanzas",
        description: "Renombrado por el Admin.",
      }),
    );
  });
  it("BLOCKING: denies renaming the locked Admin role (the rename allow is not blanket)", async () => {
    // Non-vacuity twin for the case above: if the rename allow ever became
    // unconditional, this goes red.
    await assertFails(
      updateDoc(doc(as("admin-uid", ["Admin"]), "roles/Admin"), { name: "Superusuario" }),
    );
  });
  it("denies a non-Admin renaming a built-in role", async () => {
    await assertFails(
      updateDoc(doc(as("mem-uid", ["Membership"]), "roles/Treasury"), { name: "Caja" }),
    );
  });
});

describe("firestore.rules — member permission assignment (roleIds + overrides)", () => {
  it("allows Admin to set roleIds + permissionOverrides on a member", async () => {
    await assertSucceeds(
      updateDoc(doc(as("admin-uid", ["Admin"]), "members/m1"), {
        roleIds: ["custom1"],
        permissionOverrides: { grant: ["manage:Position"], revoke: [] },
      }),
    );
  });
  it("BLOCKING: denies Membership setting roleIds (privilege escalation vector)", async () => {
    // A distinct value (not whatever the Admin test left on m1) so this is a real
    // change — setting roleIds to its current value would be a legitimate no-op.
    await assertFails(
      updateDoc(doc(as("mem-uid", ["Membership"]), "members/m1"), {
        roleIds: ["membership-self-grant"],
      }),
    );
  });
  it("BLOCKING: denies Membership setting permissionOverrides", async () => {
    await assertFails(
      updateDoc(doc(as("mem-uid", ["Membership"]), "members/m1"), {
        permissionOverrides: { grant: ["manage:all"], revoke: [] },
      }),
    );
  });
  it("still allows Membership to edit ordinary fields (roleIds untouched)", async () => {
    await assertSucceeds(
      updateDoc(doc(as("mem-uid", ["Membership"]), "members/m1"), { name: "Renombrada" }),
    );
  });
  it("allows Admin to create a member carrying roleIds", async () => {
    await assertSucceeds(
      setDoc(doc(as("admin-uid", ["Admin"]), "members/m_admin_new"), {
        name: "Nuevo",
        totalPoints: 0,
        active: true,
        deletedAt: null,
        roleIds: ["custom1"],
      }),
    );
  });
  it("BLOCKING: denies Membership creating a member with roleIds", async () => {
    await assertFails(
      setDoc(doc(as("mem-uid", ["Membership"]), "members/m_mem_new"), {
        name: "Nuevo",
        totalPoints: 0,
        active: true,
        deletedAt: null,
        roleIds: ["custom1"],
      }),
    );
  });
  it("allows Membership to create a member without permission fields", async () => {
    await assertSucceeds(
      setDoc(doc(as("mem-uid", ["Membership"]), "members/m_mem_plain"), {
        name: "Nuevo",
        totalPoints: 0,
        active: true,
        deletedAt: null,
      }),
    );
  });
});

describe("firestore.rules — perm-based coarse gates", () => {
  // A custom role confers no built-in role name; its power is entirely in `perms`.
  function asCustom(uid: string, perms: string[]) {
    return env.authenticatedContext(uid, { roles: ["Member"], perms }).firestore();
  }

  it("grants ally create to a custom role with manage:Ally and no privileged role", async () => {
    await assertSucceeds(
      setDoc(doc(asCustom("custom-uid", ["manage:Ally"]), "allies/a_custom"), {
        companyName: "Nueva",
        active: true,
        deletedAt: null,
      }),
    );
  });

  it("grants member read to a custom role with read:Member", async () => {
    await assertSucceeds(getDoc(doc(asCustom("custom-uid", ["read:Member"]), "members/m1")));
  });

  it("manage:all behaves as superuser for any subject", async () => {
    await assertSucceeds(
      setDoc(doc(asCustom("su-uid", ["manage:all"]), "allies/a_su"), {
        companyName: "X",
        active: true,
        deletedAt: null,
      }),
    );
  });

  it("denies a coarse write when the perm is absent (role present, perm not)", async () => {
    // Member role carries no coarse perms; explicit empty perms → canDo denies.
    await assertFails(
      setDoc(doc(asCustom("plain-uid", []), "allies/a_denied"), {
        companyName: "No",
        active: true,
        deletedAt: null,
      }),
    );
  });

  it("fail-closed: denies a coarse write when the perms claim is absent (pre-backfill)", async () => {
    const ctx = env.authenticatedContext("legacy-uid", { roles: ["Membership"] }).firestore();
    await assertFails(
      setDoc(doc(ctx, "allies/a_legacy"), { companyName: "Legacy", active: true, deletedAt: null }),
    );
  });

  it("reconciled: Secretary (via perms) can create + update allies", async () => {
    // Membership held create/update:Ally until the nine-role table moved the whole ally
    // surface to Secretaría; this is the same seed-mints-a-perm-the-rules-honour check,
    // one role over.
    await assertSucceeds(
      setDoc(doc(as("sec-uid", ["Secretary"]), "allies/a_sec"), {
        companyName: "Aliado",
        active: true,
        deletedAt: null,
      }),
    );
    await assertSucceeds(
      updateDoc(doc(as("sec-uid", ["Secretary"]), "allies/a1"), { companyName: "Editado" }),
    );
  });

  it("grants activity create to a custom role with manage:Activity", async () => {
    await assertSucceeds(
      setDoc(doc(asCustom("act-uid", ["manage:Activity"]), "activities/a_custom"), {
        termId: "2026",
        category: "Assembly",
      }),
    );
  });

  it("fail-closed: ProjectManager with absent perms claim cannot create an activity", async () => {
    const ctx = env.authenticatedContext("legacy-pm", { roles: ["ProjectManager"] }).firestore();
    await assertFails(
      setDoc(doc(ctx, "activities/a_legacy"), { termId: "2026", category: "Assembly" }),
    );
  });
});

describe("firestore.rules — siteConfig", () => {
  it("allows anonymous read (public site)", async () => {
    await assertSucceeds(getDoc(doc(anon(), "siteConfig/current")));
  });
  it("denies anonymous write", async () => {
    await assertFails(setDoc(doc(anon(), "siteConfig/current"), { version: 2 }));
  });
  it("denies non-admin signed-in write", async () => {
    await assertFails(setDoc(doc(as("u", ["Membership"]), "siteConfig/current"), { version: 2 }));
  });
  it("allows Admin write", async () => {
    await assertSucceeds(
      setDoc(doc(as("admin", ["Admin"]), "siteConfig/current"), {
        version: 2,
        stats: {},
        allies: [],
      }),
    );
  });
});

describe("firestore.rules — leads (public contact-form capture)", () => {
  // A well-formed submission as the spotlight write path builds it. `createdAt`
  // is a serverTimestamp so it resolves to request.time (the create rule pins it).
  function validLead(overrides: Record<string, unknown> = {}) {
    return {
      name: "Ada Lovelace",
      email: "ada@example.com",
      intent: "Alianza",
      message: "Propuesta de alianza institucional.",
      status: "Nuevo",
      source: "web",
      createdAt: serverTimestamp(),
      deletedAt: null,
      ...overrides,
    };
  }
  // A signed-in Member holding an explicit read:Lead grant (custom role path).
  function asReader(uid: string) {
    return env.authenticatedContext(uid, { roles: ["Member"], perms: ["read:Lead"] }).firestore();
  }

  it("allows an anonymous visitor to create a well-formed lead", async () => {
    await assertSucceeds(setDoc(doc(anon(), "leads/anon_ok"), validLead()));
  });
  it("allows a signed-in visitor to create a well-formed lead", async () => {
    await assertSucceeds(
      setDoc(doc(as("member-uid", ["Member"]), "leads/signedin_ok"), validLead()),
    );
  });
  it("denies a create missing the deletedAt key (would break read-schema parse)", async () => {
    await assertFails(
      setDoc(doc(anon(), "leads/nodelkey"), {
        name: "Ada Lovelace",
        email: "ada@example.com",
        intent: "Alianza",
        message: "Sin deletedAt.",
        status: "Nuevo",
        source: "web",
        createdAt: serverTimestamp(),
      }),
    );
  });
  it("denies a create carrying an unexpected field", async () => {
    await assertFails(setDoc(doc(anon(), "leads/extra"), validLead({ nickname: "Countess" })));
  });
  it("allows an optional phone (WhatsApp contact)", async () => {
    await assertSucceeds(setDoc(doc(anon(), "leads/withphone"), validLead({ phone: "77712345" })));
  });
  it("denies an over-long phone (>20)", async () => {
    await assertFails(setDoc(doc(anon(), "leads/longphone"), validLead({ phone: "1".repeat(21) })));
  });
  it("denies an over-long name (>100)", async () => {
    await assertFails(setDoc(doc(anon(), "leads/longname"), validLead({ name: "a".repeat(101) })));
  });
  it("denies an over-long message (>2000)", async () => {
    await assertFails(
      setDoc(doc(anon(), "leads/longmsg"), validLead({ message: "x".repeat(2001) })),
    );
  });
  it("denies an empty name", async () => {
    await assertFails(setDoc(doc(anon(), "leads/emptyname"), validLead({ name: "" })));
  });
  it("denies an unknown intent", async () => {
    await assertFails(setDoc(doc(anon(), "leads/badintent"), validLead({ intent: "Spam" })));
  });
  it("denies a status other than Nuevo on create", async () => {
    await assertFails(setDoc(doc(anon(), "leads/prestatus"), validLead({ status: "Contactado" })));
  });
  it("denies a source other than 'web'", async () => {
    await assertFails(setDoc(doc(anon(), "leads/badsource"), validLead({ source: "api" })));
  });
  it("denies a forged (non-request.time) createdAt", async () => {
    await assertFails(
      setDoc(doc(anon(), "leads/forgedts"), validLead({ createdAt: new Date("2020-01-01") })),
    );
  });
  it("denies a create born soft-deleted", async () => {
    await assertFails(
      setDoc(doc(anon(), "leads/predeleted"), validLead({ deletedAt: new Date() })),
    );
  });

  it("denies an anonymous read (leads carry PII)", async () => {
    await assertFails(getDoc(doc(anon(), "leads/lead_new")));
  });
  it("denies an anonymous list query (read gates list too)", async () => {
    await assertFails(getDocs(collection(anon(), "leads")));
  });
  it("denies a signed-in member without read:Lead", async () => {
    await assertFails(getDoc(doc(as("u", ["Member"]), "leads/lead_new")));
  });
  it("allows an Admin to read (manage:all)", async () => {
    await assertSucceeds(getDoc(doc(as("u", ["Admin"]), "leads/lead_new")));
  });
  it("allows a custom read:Lead holder to read", async () => {
    await assertSucceeds(getDoc(doc(asReader("reader"), "leads/lead_new")));
  });

  it("allows an Admin to advance the pipeline status", async () => {
    await assertSucceeds(
      updateDoc(doc(as("u", ["Admin"]), "leads/lead_triage"), { status: "Contactado" }),
    );
  });
  it("denies advancing to an unknown status", async () => {
    await assertFails(
      updateDoc(doc(as("u", ["Admin"]), "leads/lead_new"), { status: "Archivado" }),
    );
  });
  it("denies mutating the submitted PII (name) on update", async () => {
    await assertFails(updateDoc(doc(as("u", ["Admin"]), "leads/lead_new"), { name: "Hijack" }));
  });
  it("denies changing another field alongside status", async () => {
    await assertFails(
      updateDoc(doc(as("u", ["Admin"]), "leads/lead_new"), {
        status: "Contactado",
        email: "evil@example.com",
      }),
    );
  });
  it("denies a signed-in member without update:Lead from triaging", async () => {
    await assertFails(
      updateDoc(doc(as("u", ["Member"]), "leads/lead_new"), { status: "Contactado" }),
    );
  });
  it("allows an Admin to soft-delete (set deletedAt)", async () => {
    await assertSucceeds(
      updateDoc(doc(as("u", ["Admin"]), "leads/lead_softdel"), {
        deletedAt: new Date("2026-07-05T00:00:00Z"),
      }),
    );
  });
  it("denies un-setting deletedAt on a soft-deleted lead", async () => {
    await assertFails(
      updateDoc(doc(as("u", ["Admin"]), "leads/lead_deleted"), { deletedAt: null }),
    );
  });
  it("denies stripping the deletedAt key via deleteField() on a live lead", async () => {
    await assertFails(
      updateDoc(doc(as("u", ["Admin"]), "leads/lead_new"), { deletedAt: deleteField() }),
    );
  });
});

describe("firestore.rules — notifications (composed message)", () => {
  // A holder of the coarse create:Notification perm (any role can carry it via a
  // custom grant; ExecutiveCommittee gets it by seed). createdBy must equal the
  // caller so the send trigger can attribute the compose.
  function validNotification(uid: string, overrides: Record<string, unknown> = {}) {
    return {
      title: "Convocatoria",
      body: "Reunión general el viernes.",
      url: null,
      audience: { type: "everyone" },
      createdBy: uid,
      createdAt: serverTimestamp(),
      ...overrides,
    };
  }

  it("allows a create:Notification holder to compose a valid notification", async () => {
    await assertSucceeds(
      setDoc(
        doc(as("exec-uid", ["Member"], ["create:Notification"]), "notifications/n_ok"),
        validNotification("exec-uid"),
      ),
    );
  });
  it("denies composing without the create:Notification perm", async () => {
    await assertFails(
      setDoc(doc(as("m1", ["Member"], []), "notifications/n_noperm"), validNotification("m1")),
    );
  });
  it("denies a create that pre-sets stats (Admin-SDK-owned field)", async () => {
    await assertFails(
      setDoc(
        doc(as("exec-uid", ["Member"], ["create:Notification"]), "notifications/n_stats"),
        validNotification("exec-uid", { stats: { pushSent: 0, pushFailed: 0 } }),
      ),
    );
  });
  it("denies a create whose createdBy is not the caller", async () => {
    await assertFails(
      setDoc(
        doc(as("exec-uid", ["Member"], ["create:Notification"]), "notifications/n_forge"),
        validNotification("someone-else"),
      ),
    );
  });
  it("denies a create with an unknown audience type", async () => {
    await assertFails(
      setDoc(
        doc(as("exec-uid", ["Member"], ["create:Notification"]), "notifications/n_badaud"),
        validNotification("exec-uid", { audience: { type: "individuals" } }),
      ),
    );
  });
  it("denies a role audience with no roleId", async () => {
    await assertFails(
      setDoc(
        doc(as("exec-uid", ["Member"], ["create:Notification"]), "notifications/n_roleless"),
        validNotification("exec-uid", { audience: { type: "role" } }),
      ),
    );
  });
  it("allows a role audience with a roleId", async () => {
    await assertSucceeds(
      setDoc(
        doc(as("exec-uid", ["Member"], ["create:Notification"]), "notifications/n_role"),
        validNotification("exec-uid", { audience: { type: "role", roleId: "ExecutiveCommittee" } }),
      ),
    );
  });
  it("denies a create with an empty title", async () => {
    await assertFails(
      setDoc(
        doc(as("exec-uid", ["Member"], ["create:Notification"]), "notifications/n_emptytitle"),
        validNotification("exec-uid", { title: "" }),
      ),
    );
  });
  it("denies a create with a title over 120 chars", async () => {
    await assertFails(
      setDoc(
        doc(as("exec-uid", ["Member"], ["create:Notification"]), "notifications/n_longtitle"),
        validNotification("exec-uid", { title: "a".repeat(121) }),
      ),
    );
  });
  it("denies a create with an extra unknown field (hasOnly)", async () => {
    await assertFails(
      setDoc(
        doc(as("exec-uid", ["Member"], ["create:Notification"]), "notifications/n_extra"),
        validNotification("exec-uid", { foo: "x" }),
      ),
    );
  });
  it("denies a create whose url is not a string", async () => {
    await assertFails(
      setDoc(
        doc(as("exec-uid", ["Member"], ["create:Notification"]), "notifications/n_numurl"),
        validNotification("exec-uid", { url: 42 }),
      ),
    );
  });
  it("allows a create with a valid url string", async () => {
    await assertSucceeds(
      setDoc(
        doc(as("exec-uid", ["Member"], ["create:Notification"]), "notifications/n_url"),
        validNotification("exec-uid", { url: "https://jci.example/x" }),
      ),
    );
  });
  it("allows a read:Notification holder to read", async () => {
    await assertSucceeds(
      getDoc(doc(as("reader", ["Member"], ["read:Notification"]), "notifications/n1")),
    );
  });
  it("denies a read without read:Notification", async () => {
    await assertFails(getDoc(doc(as("noread", ["Member"], []), "notifications/n1")));
  });
  it("denies any client update (even with the perm)", async () => {
    await assertFails(
      updateDoc(
        doc(
          as("exec-uid", ["Member"], ["create:Notification", "read:Notification"]),
          "notifications/n1",
        ),
        { title: "Editado" },
      ),
    );
  });
});

describe("firestore.rules — member inbox (per-member fan-out)", () => {
  it("allows the owner to read their own inbox copy", async () => {
    await assertSucceeds(getDoc(doc(as("m1", ["Member"], []), "members/m1/notifications/n1")));
  });
  it("denies a non-owner reading another member's inbox copy", async () => {
    await assertFails(getDoc(doc(as("m2", ["Member"], []), "members/m1/notifications/n1")));
  });
  it("allows the owner to flip only the read field", async () => {
    await assertSucceeds(
      updateDoc(doc(as("m1", ["Member"], []), "members/m1/notifications/n1"), { read: true }),
    );
  });
  it("denies the owner setting read to a non-boolean", async () => {
    await assertFails(
      updateDoc(doc(as("m1", ["Member"], []), "members/m1/notifications/n1"), { read: "yes" }),
    );
  });
  it("denies the owner editing any other field (only read is mutable)", async () => {
    await assertFails(
      updateDoc(doc(as("m1", ["Member"], []), "members/m1/notifications/n1"), { title: "hax" }),
    );
  });
  it("denies the owner touching read alongside another field", async () => {
    await assertFails(
      updateDoc(doc(as("m1", ["Member"], []), "members/m1/notifications/n1"), {
        read: true,
        title: "hax",
      }),
    );
  });
  it("denies a non-owner marking someone else's inbox copy read", async () => {
    await assertFails(
      updateDoc(doc(as("m2", ["Member"], []), "members/m1/notifications/n1"), { read: true }),
    );
  });
});

describe("firestore.rules — fcmTokens (member device tokens)", () => {
  it("allows the owner to create and delete their own token", async () => {
    await assertSucceeds(
      setDoc(doc(as("m1", ["Member"], []), "members/m1/fcmTokens/tok1"), {
        createdAt: serverTimestamp(),
      }),
    );
    await assertSucceeds(deleteDoc(doc(as("m1", ["Member"], []), "members/m1/fcmTokens/tok1")));
  });
  it("denies a non-owner creating a token under another member", async () => {
    await assertFails(
      setDoc(doc(as("m2", ["Member"], []), "members/m1/fcmTokens/tok_evil"), {
        createdAt: serverTimestamp(),
      }),
    );
  });
  it("denies the owner creating a token with an extra field beyond createdAt", async () => {
    await assertFails(
      setDoc(doc(as("m1", ["Member"], []), "members/m1/fcmTokens/tok_extra"), {
        createdAt: serverTimestamp(),
        email: "x@y.z",
      }),
    );
  });
});

describe("firestore.rules — pushTokens (anonymous spotlight devices)", () => {
  it("allows an anonymous device to create a bounded token and self-delete it", async () => {
    await assertSucceeds(setDoc(doc(anon(), "pushTokens/tok1"), { createdAt: serverTimestamp() }));
    await assertSucceeds(deleteDoc(doc(anon(), "pushTokens/tok1")));
  });
  it("denies a create carrying an extra field (PII bound)", async () => {
    await assertFails(
      setDoc(doc(anon(), "pushTokens/tok2"), { createdAt: serverTimestamp(), email: "x@y.z" }),
    );
  });
});

// Rules↔types inbox-lock lockstep guard: the members/{memberId}/notifications update
// rule may permit only the fields in INBOX_MUTABLE_FIELDS (@luminova/types). The
// rules-test package can't import @luminova/types, so parse the hasOnly([...]) field
// list from RULES_SOURCE and assert it equals ["read"] — same discipline as the
// activity-locked-fields cross-check.
describe("firestore.rules — inbox lock cross-check", () => {
  it("inbox update hasOnly matches INBOX_MUTABLE_FIELDS", () => {
    const m = RULES_SOURCE.match(
      /members\/\{memberId\}\/notifications[\s\S]*?hasOnly\(\[([^\]]*)\]\)/,
    );
    const fields = m![1]
      .split(",")
      .map((s) => s.trim().replace(/['"]/g, ""))
      .filter(Boolean);
    expect(fields).toEqual(["read"]);
  });
});

describe("hard-delete denial — every collection the rules forbid client-deleting stays forbidden", () => {
  // The client never hard-deletes any collection whose rules deny it (soft-delete via update
  // where applicable), so those rules must stay a flat deny (guardrail #6). This is the single
  // place that asserts it, one entry per collection with a seeded fixture to delete. The parity
  // test wires the list to the rules so it can't drift: a new `delete: if false`/`write: if false`
  // collection, or a loosened delete rule, makes parseDeleteDeniedCollections disagree and FAILS
  // until this list is reconciled (a loosened delete is a red flag to review).
  const DELETE_DENIED: { name: string; path: string }[] = [
    { name: "members", path: "members/m1" },
    { name: "notifications", path: "notifications/n1" },
    { name: "roles", path: "roles/custom_existing" },
    { name: "terms", path: "terms/2026" },
    { name: "activities", path: "activities/act1" },
    { name: "programs", path: "programs/prog1" },
    { name: "leads", path: "leads/lead_new" },
    { name: "projects", path: "projects/p1" },
    { name: "positions", path: "positions/pos1" },
    { name: "allies", path: "allies/a1" },
    { name: "pointRules", path: "pointRules/r1" },
    { name: "participations", path: "participations/part1" },
    { name: "memberPoints", path: "memberPoints/2025/03/e1" },
    { name: "showcase", path: "showcase/s1" },
    { name: "allyShowcase", path: "allyShowcase/a1" },
    { name: "boardShowcase", path: "boardShowcase/b1" },
  ];

  it("the rules' unconditional delete-deny set is EXACTLY the collections we cover (no drift)", () => {
    expect(parseDeleteDeniedCollections(RULES_SOURCE)).toEqual(
      DELETE_DENIED.map((c) => c.name).sort(),
    );
  });

  for (const { name, path } of DELETE_DENIED) {
    it(`denies hard delete of ${name} even for Admin`, async () => {
      await assertFails(deleteDoc(doc(as("u", ["Admin"]), path)));
    });
  }
});
