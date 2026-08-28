import { describe, expect, it } from "vitest";
import type { Position } from "@luminova/types";
import {
  cargoGrantNeedsAdminAssigner,
  cargoNoteId,
  cargoOptionsForEditor,
  cargoTakedownOnly,
  noAssignableCargos,
  positionsLockedForEditor,
  type CargoOption,
} from "./assignable-cargo";

const cargo = (
  category: Position["category"],
  grants: Position["grants"] = [],
): Pick<Position, "grants" | "category"> => ({ category, grants });

const POWER = cargo("CEL", ["Secretary"]);
const CEL_FREE = cargo("CEL");
const JDL_FREE = cargo("JDL");

// positionsLockedForEditor mirrors the OLD side of firestore.rules positionsAssignmentSafe()
// (`currentCargoGrantsEmpty`, the cargo being REPLACED), which is Admin-ROLE only and is
// deliberately NOT lifted by update:BoardSeat. Its flag is therefore NOT `allowPowerGrants`.
// The full truth table lives here because that asymmetry is now the load-bearing one: the
// forms exercise the two diagonal cells, and the delegate cell is the one the old
// `!allowPowerGrants && …` call sites got wrong.
describe("positionsLockedForEditor", () => {
  it("locks a power-granting cargo for anyone who may not replace one", () => {
    expect(positionsLockedForEditor(POWER, false)).toBe(true);
  });

  it("does not lock a power-granting cargo for an Admin", () => {
    expect(positionsLockedForEditor(POWER, true)).toBe(false);
  });

  it("never locks a grant-free cargo, CEL or JDL, either way", () => {
    // The asymmetric case: keeping a grant-free CEL seat is denied but CLEARING it is allowed
    // on purpose, so locking here would strand the takedown behind an Admin.
    for (const flag of [true, false]) {
      expect(positionsLockedForEditor(CEL_FREE, flag)).toBe(false);
      expect(positionsLockedForEditor(JDL_FREE, flag)).toBe(false);
    }
  });

  it("never locks when there is no assigned cargo", () => {
    expect(positionsLockedForEditor(undefined, false)).toBe(false);
    expect(positionsLockedForEditor(undefined, true)).toBe(false);
  });

  it("BLOCKING: the flag is honored independently of the NEW-side one", () => {
    // The regression in one line. A board-seat delegate carries allowPowerGrants=true (the
    // NEW side, which update:BoardSeat lifts) while allowReplacePowerCargo stays false (the
    // OLD side, Admin-only). Folding the two into one flag unlocked a write the rules always
    // deny; this asserts the OLD side is the ONLY input here.
    expect(positionsLockedForEditor(POWER, false)).toBe(true);
    expect(cargoTakedownOnly(POWER, true)).toBe(false);
  });
});

// The third derived render-state. Two of its three clauses are unreachable through the form
// tests, so each is pinned as an explicit row rather than inferred from a rendered note.
describe("noAssignableCargos", () => {
  const OPTION: CargoOption = { value: "dir", label: "Director" };

  it("is false for a delegate: they may assign, the ceiling filtered nothing", () => {
    expect(noAssignableCargos({ cargoOptions: [], allowPowerGrants: true, locked: false })).toBe(
      false,
    );
  });

  it("is false when locked: the locked note is the honest explanation, not this one", () => {
    expect(noAssignableCargos({ cargoOptions: [], allowPowerGrants: false, locked: true })).toBe(
      false,
    );
  });

  it("is true for a non-delegate whose option list came back empty", () => {
    expect(noAssignableCargos({ cargoOptions: [], allowPowerGrants: false, locked: false })).toBe(
      true,
    );
  });

  it("is false whenever there is anything to pick", () => {
    expect(
      noAssignableCargos({ cargoOptions: [OPTION], allowPowerGrants: false, locked: false }),
    ).toBe(false);
    expect(
      noAssignableCargos({ cargoOptions: [OPTION], allowPowerGrants: true, locked: false }),
    ).toBe(false);
  });

  // The `!locked` clause is DEFENSIVE, not reachable through either form today, and this pins
  // the invariant that makes it so — rather than deleting a clause whose redundancy depends on
  // a coincidence between two other functions.
  //
  // Both forms derive `locked` and `cargoOptions` from the SAME (positions, assignedCargoId)
  // pair. locked === true therefore implies the id resolved (positionsLockedForEditor returns
  // false for an unresolved cargo) and carries grants, so cargoOptionsForEditor appends it as a
  // disabled option and the length clause alone already returns false. Break either half — give
  // the forms independent inputs, or stop appending the held cargo — and `!locked` becomes the
  // only thing keeping the locked note and the empty-catalog note from rendering together.
  it("BLOCKING: locked implies a non-empty option list, which is why !locked is defensive", () => {
    const held: Position = {
      id: "pos-power",
      title: "Secretario",
      titleFemale: null,
      category: "CEL",
      grants: ["Secretary"],
      term: null,
      sigla: null,
      description: "",
      active: true,
      deletedAt: null,
    };
    const locked = positionsLockedForEditor(held, false);
    expect(locked).toBe(true);
    const cargoOptions = cargoOptionsForEditor({
      positions: [held],
      gender: "Masculino",
      allowPowerGrants: false,
      assignedCargoId: held.id,
    });
    expect(cargoOptions).toHaveLength(1);
    expect(cargoOptions[0]).toMatchObject({ value: "pos-power", disabled: true });
    expect(noAssignableCargos({ cargoOptions, allowPowerGrants: false, locked })).toBe(false);
  });
});

// The one outcome in this lane that fails SILENTLY. boardSeatDelegate() lets a delegate write
// a vacant power cargo and the write succeeds — but resolveTrustedGrants refuses to mint on
// EITHER of two disjoint conditions, so the seat publishes and nothing says the claim is
// missing. Keyed on the Admin ROLE (beacon's `assignerIsAdmin`), NOT on allowPowerGrants: the
// perm lifts the WRITE, never the MINT.
describe("cargoGrantNeedsAdminAssigner", () => {
  const ADMIN_CARGO = cargo("CEL", ["Admin"]);

  // BLOCKING: the full truth table of all three arguments, because the predicate previously
  // mirrored only ONE of resolveTrustedGrants' two refusals:
  //
  //   trusted = (grants.includes("Admin") || selfAssigned) ? assignerIsAdmin
  //                                                       : assignerIsAdmin || hasBoardSeatPerm
  //
  // Enumerated rather than sampled: the missing term (`selfAssigned`) sat in exactly two cells
  // of this table, both of them non-Admin + non-Admin-granting, which is the shape every
  // pre-existing case here already asserted as SILENT. A sampled suite therefore agreed with
  // the bug. `expected` is derived from nothing — it is transcribed from beacon.
  const TABLE: {
    name: string;
    cargo: Pick<Position, "grants" | "category"> | undefined;
    assignerIsAdmin: boolean;
    isSelfAssignment: boolean;
    expected: boolean;
  }[] = [
    // No cargo at all: nothing to mint, nothing to warn about, either principal, either way.
    {
      name: "none",
      cargo: undefined,
      assignerIsAdmin: false,
      isSelfAssignment: false,
      expected: false,
    },
    {
      name: "none",
      cargo: undefined,
      assignerIsAdmin: false,
      isSelfAssignment: true,
      expected: false,
    },
    {
      name: "none",
      cargo: undefined,
      assignerIsAdmin: true,
      isSelfAssignment: false,
      expected: false,
    },
    {
      name: "none",
      cargo: undefined,
      assignerIsAdmin: true,
      isSelfAssignment: true,
      expected: false,
    },
    // Grant-free: resolveTrustedGrants returns [] on `grants.length === 0` BEFORE it reads
    // either flag, so there is no pending mint to warn about even when self-assigning.
    {
      name: "grant-free CEL",
      cargo: CEL_FREE,
      assignerIsAdmin: false,
      isSelfAssignment: false,
      expected: false,
    },
    {
      name: "grant-free CEL",
      cargo: CEL_FREE,
      assignerIsAdmin: false,
      isSelfAssignment: true,
      expected: false,
    },
    {
      name: "grant-free CEL",
      cargo: CEL_FREE,
      assignerIsAdmin: true,
      isSelfAssignment: false,
      expected: false,
    },
    {
      name: "grant-free CEL",
      cargo: CEL_FREE,
      assignerIsAdmin: true,
      isSelfAssignment: true,
      expected: false,
    },
    {
      name: "grant-free JDL",
      cargo: JDL_FREE,
      assignerIsAdmin: false,
      isSelfAssignment: false,
      expected: false,
    },
    {
      name: "grant-free JDL",
      cargo: JDL_FREE,
      assignerIsAdmin: false,
      isSelfAssignment: true,
      expected: false,
    },
    // Non-Admin-granting POWER cargo. The delegation's whole point is the first row: a
    // Secretary-granting seat IS honored from an update:BoardSeat assigner, so warning there
    // would be false. The second row is the finding — same cargo, same principal, and the mint
    // silently stops the moment the target is the caller.
    {
      name: "Secretary-granting",
      cargo: POWER,
      assignerIsAdmin: false,
      isSelfAssignment: false,
      expected: false,
    },
    {
      name: "Secretary-granting",
      cargo: POWER,
      assignerIsAdmin: false,
      isSelfAssignment: true,
      expected: true,
    },
    {
      name: "Secretary-granting",
      cargo: POWER,
      assignerIsAdmin: true,
      isSelfAssignment: false,
      expected: false,
    },
    // An Admin self-assigning mints normally — `assignerIsAdmin` satisfies BOTH arms — so the
    // note must not fire. This is the cell that stops the fix from being "warn on any self".
    {
      name: "Secretary-granting",
      cargo: POWER,
      assignerIsAdmin: true,
      isSelfAssignment: true,
      expected: false,
    },
    // Admin-granting: refused from a non-Admin whoever the target is.
    {
      name: "Admin-granting",
      cargo: ADMIN_CARGO,
      assignerIsAdmin: false,
      isSelfAssignment: false,
      expected: true,
    },
    {
      name: "Admin-granting",
      cargo: ADMIN_CARGO,
      assignerIsAdmin: false,
      isSelfAssignment: true,
      expected: true,
    },
    {
      name: "Admin-granting",
      cargo: ADMIN_CARGO,
      assignerIsAdmin: true,
      isSelfAssignment: false,
      expected: false,
    },
    {
      name: "Admin-granting",
      cargo: ADMIN_CARGO,
      assignerIsAdmin: true,
      isSelfAssignment: true,
      expected: false,
    },
  ];

  it.each(TABLE)(
    "BLOCKING: $name, admin=$assignerIsAdmin, self=$isSelfAssignment → $expected",
    ({ cargo: c, assignerIsAdmin, isSelfAssignment, expected }) => {
      expect(cargoGrantNeedsAdminAssigner(c, assignerIsAdmin, isSelfAssignment)).toBe(expected);
    },
  );

  // The finding in one line, spelled out away from the table so a future reader meets the
  // scenario and not just a row. A delegate holding update:Position + update:BoardSeat opens
  // their OWN profile and seats themselves on a vacant Secretario: firestore.rules permits the
  // write, the seat publishes to the Directiva, and resolveTrustedGrants mints nothing because
  // `selfAssigned && !assignerIsAdmin`. No response carries that — the note is the only channel.
  it("BLOCKING: a delegate seating THEMSELVES on a non-Admin power cargo mints nothing", () => {
    expect(cargoGrantNeedsAdminAssigner(POWER, false, true)).toBe(true);
    // Same delegate, same cargo, someone else's profile: honored, so silence is correct.
    expect(cargoGrantNeedsAdminAssigner(POWER, false, false)).toBe(false);
  });
});

// The fourth derived render-state. Both forms hand-rolled this as a two-branch ternary that
// only knew `noCargos` and `locked`, so the takedown and mint-pending notes were rendered but
// never ASSOCIATED — a screen-reader user on the trigger met neither.
describe("cargoNoteId", () => {
  const IDS = {
    noCargos: "no-cargos",
    locked: "locked",
    takedown: "takedown",
    mintPending: "mint",
  };
  const NONE = { noCargos: false, locked: false, takedown: false, mintPending: false };

  it("returns undefined when no note is rendered", () => {
    expect(cargoNoteId(NONE, IDS)).toBeUndefined();
  });

  it("returns each state's own id when it is the only one firing", () => {
    expect(cargoNoteId({ ...NONE, noCargos: true }, IDS)).toBe(IDS.noCargos);
    expect(cargoNoteId({ ...NONE, locked: true }, IDS)).toBe(IDS.locked);
    expect(cargoNoteId({ ...NONE, takedown: true }, IDS)).toBe(IDS.takedown);
    expect(cargoNoteId({ ...NONE, mintPending: true }, IDS)).toBe(IDS.mintPending);
  });

  // BLOCKING: priority is most-blocking-first, and it is only observable when states co-fire.
  // Asserting one state at a time would pass under ANY ordering of the four ifs.
  it("BLOCKING: resolves co-firing states most-blocking-first", () => {
    const all = { noCargos: true, locked: true, takedown: true, mintPending: true };
    expect(cargoNoteId(all, IDS)).toBe(IDS.noCargos);
    expect(cargoNoteId({ ...all, noCargos: false }, IDS)).toBe(IDS.locked);
    expect(cargoNoteId({ ...all, noCargos: false, locked: false }, IDS)).toBe(IDS.takedown);
    expect(cargoNoteId({ ...NONE, takedown: true, mintPending: true }, IDS)).toBe(IDS.takedown);
  });

  // The ids are passed in, not owned here, because the locked and takedown wordings differ
  // between the two forms. Pin that they are echoed verbatim — a hardcoded id here would send
  // aria-describedby at an element that exists in only one of the two forms.
  it("echoes the caller's ids rather than owning any", () => {
    const other = { noCargos: "a", locked: "b", takedown: "c", mintPending: "d" };
    expect(cargoNoteId({ ...NONE, mintPending: true }, other)).toBe("d");
  });
});
