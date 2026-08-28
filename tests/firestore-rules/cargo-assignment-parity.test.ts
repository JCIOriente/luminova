import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, setDoc, updateDoc, type Firestore } from "firebase/firestore";
import { buildAbility, type Action, type Subject } from "@luminova/auth/ability";
import { hasAnyRole, hasPerm, ROLES, type AuthClaims } from "@luminova/auth/roles";
import { permsForRoles } from "../../tools/scripts/lib/role-seed.mjs";
// The SAME modules the two member forms render from. `assignable-cargo-core` is import-free
// and `member-edit-gate` / `probe` pull only `@luminova/auth`, so all three load here —
// `assignable-cargo.ts` itself does NOT (it needs `@luminova/types` for value, which this
// package cannot resolve), which is exactly why the predicates were split out. Same shape,
// and same reason, as `nav-equivalence.test.ts` importing `nav-config`.
import {
  cargoSlotsForEditor,
  cargoTakedownOnly,
  positionsLockedForEditor,
  type CargoLike,
} from "../../apps/backstage/src/features/members/lib/assignable-cargo-core";
import { memberEditMode } from "../../apps/backstage/src/features/members/lib/member-edit-gate";
import { abilityAllows } from "../../apps/backstage/src/lib/authz/probe";

// The contract: for every (principal, member fixture, cargo) triple, IF the backstage cargo
// editor would let this editor submit this cargo for this member, THEN the real rules engine
// must allow the corresponding members write — on both lanes, `positionsAssignmentSafe()` on
// update and `createPositionsSafe()` on create, with `assignedBy` self-stamped exactly as
// `member-repository.ts`'s `setPositions` does it.
//
// One principal fixture drives both sides: the claims the emulator context receives are the
// claims the client gates are built from, so an option list that admits a write the rules
// reject fails HERE rather than as a PERMISSION_DENIED toast in production. That has already
// happened twice on this branch — `cargoOptionsForEditor` offering a CEL cargo the rules deny,
// and `positionsLockedForEditor`'s flag being widened until the editor unlocked for a write
// the rules ALWAYS deny — and `assignable-cargo.test.ts`, a hand-written truth table that never
// reads `firestore.rules`, stays green through both.
//
// This is an IMPLICATION, not equality. The client is deliberately stricter in places (comisión
// cargos are filtered out of the picker though the rules would take a grant-free one; a member
// editor may clear a seat the rules would also let them keep), and flagging that curation would
// make the test an obstacle to it. It verifies nothing about the rules' OTHER conjuncts —
// `memberWriteInvariants`, the self lane, the takedown arm — which remain `rules.test.ts`'s.
//
// Per `docs/engineering-guardrails.md` this is the "parity test, never a hand-maintained
// mirror list" half only. The parser half is deliberately NOT built: these are BOOLEAN
// PREDICATES over `get()` fan-out and `resource` vs `request.resource`, which no shared TS
// description expresses — the emulator IS the parser.

const PROJECT_ID = "demo-cargo-parity";
let env: RulesTestEnvironment;

// Rules derive the term from request.time.year() (UTC); compute it from the client clock so
// this suite cannot rot when the calendar year rolls over.
const TERM = String(new Date().getUTCFullYear());
const PRIOR_TERM = Number(TERM) - 1;
/** Whoever seated the fixture member before the test's principal touches it. */
const SEEDER_UID = "seed-admin-uid";

interface Principal {
  label: string;
  uid: string;
  roles: string[];
  perms: string[];
}
const canonical = (role: string): Principal => ({
  label: role,
  uid: `${role.toLowerCase()}-uid`,
  roles: [role],
  perms: permsForRoles([role]),
});
const custom = (label: string, perms: string[]): Principal => ({
  label: `custom(${label})`,
  uid: `${label}-uid`,
  roles: [],
  perms,
});

const PRINCIPALS: Principal[] = [
  // Derived from ROLES, never hand-listed: a new built-in role is held to the implication from
  // the moment it exists, rather than when someone remembers to add it here.
  ...ROLES.map((role) => canonical(role)),
  // Perms-only customs — the principals owner-op 1 describes, and the ones the delegation
  // feature is actually about. Each names the exact capability the lane keys on:
  custom("update-Member", ["update:Member"]), // institutional lane, no delegation
  custom("update-Position", ["update:Position"]), // members-positions lane, ceiling = grant-free JDL
  custom("update-BoardSeat", ["update:BoardSeat"]), // NON-VACUITY: the code widens which cargo an
  // editor may seat, it does not make anyone an editor — this principal must reach no lane at all.
  custom("position+boardseat", ["update:Position", "update:BoardSeat"]), // the spec's recommended pairing
  custom("member+boardseat", ["update:Member", "update:BoardSeat"]),
  custom("create-Member", ["create:Member"]),
  custom("create+boardseat", ["create:Member", "update:BoardSeat"]),
  // Escalation probe: `manage:all` satisfies the rules' canDo() but is NOT the exact code
  // boardSeatDelegate()/canAssignBoardSeat ask for, so it must never be offered a CEL seat.
  custom("manage-all", ["manage:all"]),
];

/** Bridge the seed producer's plain string arrays (role-seed.mjs) to the typed claim. */
const claimsOf = (p: Principal): AuthClaims =>
  ({ roles: p.roles, perms: p.perms }) as unknown as AuthClaims;

function as(p: Principal): Firestore {
  return env.authenticatedContext(p.uid, { roles: p.roles, perms: p.perms }).firestore();
}

interface Gates {
  /** Which member editor the profile page mounts (features/members/lib/member-edit-gate). */
  editMode: "full" | "positions" | "none";
  /** Whether the invite drawer's "Invitar miembro" affordance exists (`<Can I="create" a="Member">`). */
  canCreate: boolean;
  /** `Can.isAdmin` — the OLD-side flag (`allowReplacePowerCargo`), never delegated. */
  isAdmin: boolean;
  /** `Can.canAssignBoardSeat` — the NEW-side flag (`allowPowerGrants`), which update:BoardSeat lifts. */
  allowPowerGrants: boolean;
}

/** The claims → form-props mapping the four call sites make (`member-profile-page.tsx`,
 *  `member-drawer.tsx`, `member-invite-drawer.tsx`): `allowPowerGrants={canAssignBoardSeat}`,
 *  `allowReplacePowerCargo={isAdmin}`. `adminOrPerm` is re-derived from the same `hasAnyRole` /
 *  `hasPerm` primitives `buildCan` uses rather than imported, because `use-can.ts` is a React
 *  module this package cannot load; `member-profile-page.test.tsx` is what pins the props to
 *  those two flags. `hasPerm`, never the ability, is the point — `manage:all` must not answer a
 *  gate the rules key on an exact code. */
function gatesFor(p: Principal): Gates {
  const claims = claimsOf(p);
  const ability = buildAbility(claims, p.uid);
  const can = (action: Action, subject: Subject) => abilityAllows(ability, action, subject);
  return {
    editMode: memberEditMode({ can }),
    canCreate: can("create", "Member"),
    isAdmin: hasAnyRole(claims, ["Admin"]),
    allowPowerGrants: hasAnyRole(claims, ["Admin"]) || hasPerm(claims, "update:BoardSeat"),
  };
}

interface Cargo extends CargoLike {
  title: string;
  description: string;
  deletedAt: null;
}
// `category` is a literal union HERE even though CargoLike widens it to `string`. This is the
// one error the parity test structurally cannot catch: the same fixture object is both fed to
// the client predicate and seeded into the emulator, so a `"cel"` typo would make the rules'
// `category != 'CEL'` and the client's `category !== "CEL"` agree with each other — and agree
// wrongly, on the publication boundary, with the suite green. The compiler is the only guard
// available for it, so give it one.
const cargo = (
  id: string,
  category: "CEL" | "JDL" | "Comision",
  grants: string[],
  extra: Partial<Cargo> = {},
): Cargo => ({
  id,
  title: id,
  description: "",
  category,
  grants,
  term: category === "JDL" ? Number(TERM) : null,
  active: true,
  deletedAt: null,
  ...extra,
});

/** The positions catalog, seeded into the emulator AND handed to `cargoSlotsForEditor` — one
 *  fixture, both sides, so the option list and the `get()` the rules perform can never describe
 *  different cargos. Spans every axis the two rules conjuncts turn on: grants vs none, CEL vs
 *  JDL (the publication boundary), plus the three the CLIENT filters on its own (comisión,
 *  deactivated, past term) so the implication is exercised where the client is stricter. */
const CATALOG: Cargo[] = [
  cargo("jdl_free", "JDL", []),
  cargo("jdl_free_alt", "JDL", []),
  cargo("cel_free", "CEL", []), // grant-free CEL: the deliberate takedown asymmetry
  cargo("cel_power", "CEL", ["Admin"]), // Presidente-shaped: publishes at board rank 0 AND mints
  cargo("jdl_power", "JDL", ["Secretary"]),
  cargo("comision_free", "Comision", []),
  cargo("jdl_retired", "JDL", [], { term: PRIOR_TERM }),
  cargo("jdl_inactive", "JDL", [], { active: false }),
];
const cargoById = (id: string | null) => CATALOG.find((c) => c.id === id);

interface MemberFixture {
  key: string;
  /** The cargo this member already holds in the CURRENT term — the OLD side of the swap. */
  cargoId: string | null;
}
/** The states `currentCargoGrantsEmpty()` (the cargo being REPLACED) turns on. */
const MEMBER_FIXTURES: MemberFixture[] = [
  { key: "unseated", cargoId: null },
  { key: "seated-jdl-free", cargoId: "jdl_free" },
  { key: "seated-cel-free", cargoId: "cel_free" }, // keeping it is denied, CLEARING it is not
  { key: "seated-jdl-power", cargoId: "jdl_power" },
  { key: "seated-cel-power", cargoId: "cel_power" },
  { key: "seated-retired", cargoId: "jdl_retired" }, // held cargo outside the option list
];

/** What the cargo Combobox would let this editor SUBMIT for this member: every enabled option,
 *  plus `null` — clearing the slot, which the forms always offer while the slot is unlocked and
 *  which `cargoTakedownOnly` makes an explicit "Quitar cargo" action. A locked slot submits
 *  nothing at all. */
function offeredCargoIds(g: Gates, assignedCargoId: string | null): (string | null)[] {
  const held = cargoById(assignedCargoId);
  if (positionsLockedForEditor(held, g.isAdmin)) return [];
  const enabled = cargoSlotsForEditor({
    positions: CATALOG,
    allowPowerGrants: g.allowPowerGrants,
    assignedCargoId,
    term: TERM,
  })
    .filter((slot) => !slot.disabled)
    .map((slot) => slot.position.id);
  return [null, ...enabled];
}

type Lane = "update" | "create";
interface Triple {
  principal: Principal;
  lane: Lane;
  fixture: MemberFixture;
  cargoId: string | null;
}

const NEW_MEMBER: MemberFixture = { key: "new-member", cargoId: null };

/** Every triple the UI offers, materialized up front so the structural assertions below can
 *  interrogate the matrix itself — an implication suite is vacuously green when nothing is
 *  offered, so "what did we actually probe" has to be assertable. */
const MATRIX: Triple[] = PRINCIPALS.flatMap((principal) => {
  const g = gatesFor(principal);
  const update: Triple[] =
    g.editMode === "none"
      ? []
      : MEMBER_FIXTURES.flatMap((fixture) =>
          offeredCargoIds(g, fixture.cargoId).map((cargoId) => ({
            principal,
            lane: "update" as const,
            fixture,
            cargoId,
          })),
        );
  const create: Triple[] = g.canCreate
    ? offeredCargoIds(g, null).map((cargoId) => ({
        principal,
        lane: "create" as const,
        fixture: NEW_MEMBER,
        cargoId,
      }))
    : [];
  return [...update, ...create];
});

const MEMBER_DOC = { name: "Ana Lopez", totalPoints: 0, active: true, deletedAt: null };

/** The exact payload `MemberRepository.setPositions` writes: the current term only, by dot
 *  path, with `assignedBy` self-stamped. Accepted by BOTH update arms — the institutional
 *  `update:Member` one and the `update:Position` members-positions lane, which additionally
 *  requires `affectedKeys().hasOnly(['positions'])`. */
function writeUpdate(db: Firestore, id: string, cargoId: string | null, uid: string) {
  return updateDoc(doc(db, `members/${id}`), {
    [`positions.${TERM}`]: { cargoId, comisionIds: [], assignedBy: uid },
  });
}

/** The create-lane twin: a member born on the cargo, self-stamped, in the current term only. */
function writeCreate(db: Firestore, id: string, cargoId: string | null, uid: string) {
  return setDoc(doc(db, `members/${id}`), {
    ...MEMBER_DOC,
    positions: { [TERM]: { cargoId, comisionIds: [], assignedBy: uid } },
  });
}

let docCounter = 0;
/** A fresh member doc per assertion. An ALLOWED write mutates the fixture it lands on, so a
 *  shared doc would make every later triple depend on the order the earlier ones ran in. */
async function seedMember(fixture: MemberFixture): Promise<string> {
  const id = `parity_${fixture.key}_${docCounter++}`;
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `members/${id}`), {
      ...MEMBER_DOC,
      ...(fixture.cargoId === null
        ? {}
        : {
            positions: {
              [TERM]: { cargoId: fixture.cargoId, comisionIds: [], assignedBy: SEEDER_UID },
            },
          }),
    });
  });
  return id;
}

const describeTriple = (t: Triple) =>
  `${t.principal.label} ${t.lane}s ${t.fixture.key} → cargo ${t.cargoId ?? "null (clear)"}`;

async function assertRulesAllow(t: Triple): Promise<void> {
  const id = t.lane === "update" ? await seedMember(t.fixture) : `parity_created_${docCounter++}`;
  const db = as(t.principal);
  const write =
    t.lane === "update"
      ? writeUpdate(db, id, t.cargoId, t.principal.uid)
      : writeCreate(db, id, t.cargoId, t.principal.uid);
  try {
    await assertSucceeds(write);
  } catch (error) {
    throw new Error(
      `the cargo editor OFFERS "${describeTriple(t)}" but firestore.rules DENY that write — ` +
        `the client mirror in assignable-cargo-core.ts has drifted from ` +
        `positionsAssignmentSafe()/createPositionsSafe(). Cause: ${String(error)}`,
    );
  }
}

beforeAll(async () => {
  const rulesPath = resolve(fileURLToPath(new URL("../../firestore.rules", import.meta.url)));
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: "127.0.0.1",
      port: Number(process.env.FIRESTORE_EMULATOR_PORT ?? 4010),
      rules: readFileSync(rulesPath, "utf8"),
    },
  });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    // cargoAssignableByNonAdmin()/currentCargoGrantsEmpty() get() these docs; a missing one
    // errors the rule (fail-closed), so the catalog must exist before any triple runs.
    for (const c of CATALOG) await setDoc(doc(db, `positions/${c.id}`), c);
  });
});

afterAll(async () => {
  await env.cleanup();
});

describe("cargo assignment ⟷ rules: every OFFERED cargo is a write the emulator allows", () => {
  // The implication is vacuously true wherever nothing is offered, so pin what the matrix
  // actually probes. Each of these would have caught a predicate that regressed to offering
  // nothing — which passes the implication while breaking the feature.
  it("probes every member fixture, both lanes, and a cargo that is not just 'clear'", () => {
    for (const fixture of MEMBER_FIXTURES) {
      expect(
        MATRIX.some((t) => t.fixture.key === fixture.key && t.cargoId !== null),
        `no principal is offered any cargo for the ${fixture.key} fixture — it never probes`,
      ).toBe(true);
    }
    for (const lane of ["update", "create"] as const) {
      expect(MATRIX.some((t) => t.lane === lane && t.cargoId !== null)).toBe(true);
    }
  });

  // The OLD-side conjunct is the Admin ROLE and nothing else — not the delegate, not manage:all
  // (which is reachable as a perm without the role). Asserted over the matrix rather than left
  // implicit in the absence of generated cases, so a widening shows up as a failure here and not
  // as an extra green test nobody reads.
  it("a power-cargo seat is submittable by the Admin role and by no one else", () => {
    for (const key of ["seated-jdl-power", "seated-cel-power"]) {
      const offered = MATRIX.filter((t) => t.fixture.key === key).map((t) => t.principal.label);
      expect([...new Set(offered)]).toEqual(["Admin"]);
    }
  });

  it("the delegation is live: only a board-seat delegate is offered CEL and power cargos", () => {
    const celOffered = (label: string) =>
      MATRIX.some(
        (t) =>
          t.principal.label === label && (t.cargoId === "cel_free" || t.cargoId === "cel_power"),
      );
    expect(celOffered("custom(position+boardseat)")).toBe(true);
    expect(celOffered("custom(create+boardseat)")).toBe(true);
    expect(celOffered("Admin")).toBe(true);
    // The ceiling the lane keeps for everyone else — including the manage:all escalation probe,
    // which satisfies canDo() but not the exact code boardSeatDelegate() asks for.
    expect(celOffered("custom(update-Position)")).toBe(false);
    expect(celOffered("custom(update-Member)")).toBe(false);
    expect(celOffered("custom(manage-all)")).toBe(false);
    expect(celOffered("Membership")).toBe(false);
  });

  it("update:BoardSeat alone reaches no lane: the code widens a ceiling, it grants no entry", () => {
    expect(MATRIX.some((t) => t.principal.label === "custom(update-BoardSeat)")).toBe(false);
  });

  for (const principal of PRINCIPALS) {
    for (const lane of ["update", "create"] as const) {
      for (const fixture of lane === "update" ? MEMBER_FIXTURES : [NEW_MEMBER]) {
        const triples = MATRIX.filter(
          (t) => t.principal === principal && t.lane === lane && t.fixture.key === fixture.key,
        );
        if (triples.length === 0) continue;
        const offered = triples.map((t) => t.cargoId ?? "null").join(", ");
        it(`${principal.label} ${lane}s ${fixture.key}: offers [${offered}] ⟹ rules allow each`, async () => {
          for (const triple of triples) await assertRulesAllow(triple);
        });
      }
    }
  }

  // The takedown asymmetry, asserted as its own row because it is the one state where the
  // client is stricter on one side and NOT the other: a non-delegate may not keep a grant-free
  // CEL seat but must be able to clear it, so `null` has to be in the offered set (denying it
  // would strand the takedown behind an Admin, which firestore.rules explicitly refuses to do).
  it("a grant-free CEL seat is takedown-only for a non-delegate, and the takedown is offered", () => {
    const g = gatesFor(PRINCIPALS.find((p) => p.label === "custom(update-Position)")!);
    expect(cargoTakedownOnly(cargoById("cel_free"), g.allowPowerGrants)).toBe(true);
    const offers = offeredCargoIds(g, "cel_free");
    expect(offers).toContain(null);
    expect(offers).not.toContain("cel_free");
  });

  // The counterfactual for drift #2, driven through the emulator rather than asserted about the
  // client alone: feeding the NEW-side flag (`allowPowerGrants`, which update:BoardSeat lifts)
  // into `positionsLockedForEditor` — whose conjunct, `currentCargoGrantsEmpty()`, is Admin-ROLE
  // only — unlocks the slot for a delegate, and every write it would then submit is denied. This
  // is what "the two flags are not the same one" costs when it is got wrong.
  it("wiring allowPowerGrants into the OLD-side flag would offer writes the rules deny", async () => {
    const delegate = PRINCIPALS.find((p) => p.label === "custom(position+boardseat)")!;
    const g = gatesFor(delegate);
    const held = cargoById("jdl_power");
    expect(positionsLockedForEditor(held, g.isAdmin)).toBe(true);
    expect(positionsLockedForEditor(held, g.allowPowerGrants)).toBe(false);
    const id = await seedMember({ key: "seated-jdl-power", cargoId: "jdl_power" });
    await assertFails(writeUpdate(as(delegate), id, "jdl_free", delegate.uid));
    await assertFails(writeUpdate(as(delegate), id, null, delegate.uid));
  });
});
