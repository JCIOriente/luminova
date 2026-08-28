import { describe, expect, it } from "vitest";
import type { Position } from "@luminova/types";
import {
  cargoGrantNeedsAdminAssigner,
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
// an Admin-granting cargo and the write succeeds — but resolveTrustedGrants honors an
// Admin-conferring cargo only for an Admin-ROLE assigner, so the seat publishes and mints
// nothing. Keyed on the same flag as positionsLockedForEditor (the Admin role), NOT on
// allowPowerGrants, for the same reason: update:BoardSeat does not lift it.
describe("cargoGrantNeedsAdminAssigner", () => {
  const ADMIN_CARGO = cargo("CEL", ["Admin"]);

  it("warns a non-Admin assigning an Admin-granting cargo", () => {
    expect(cargoGrantNeedsAdminAssigner(ADMIN_CARGO, false)).toBe(true);
  });

  it("stays silent for an Admin, who mints what they assign", () => {
    expect(cargoGrantNeedsAdminAssigner(ADMIN_CARGO, true)).toBe(false);
  });

  it("stays silent for a cargo whose grants a delegate DOES mint", () => {
    // The delegation's whole point: a Secretary-granting seat is honored from an
    // update:BoardSeat assigner, so warning about it would be false.
    expect(cargoGrantNeedsAdminAssigner(POWER, false)).toBe(false);
    expect(cargoGrantNeedsAdminAssigner(CEL_FREE, false)).toBe(false);
    expect(cargoGrantNeedsAdminAssigner(JDL_FREE, false)).toBe(false);
  });

  it("stays silent with no cargo selected", () => {
    expect(cargoGrantNeedsAdminAssigner(undefined, false)).toBe(false);
  });
});
