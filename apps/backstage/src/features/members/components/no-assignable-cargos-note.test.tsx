import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import type { Position } from "@luminova/types";
import { cargoNoteIds } from "./no-assignable-cargos-note";
import { MemberForm } from "./member-form";
import { MemberPositionsForm } from "./member-positions-form";

// A catalog whose only cargo confers a role. Two states fall out of it and they are the two
// this file needs:
//   cargoId null  →  every option filtered away for a non-delegate  →  the noCargos note,
//                    which is a SHARED component (both forms render the same element).
//   cargoId set   →  positionsLockedForEditor  →  the locked note, which each form renders
//                    itself with its own wording.
const POWER_CARGO: Position = {
  id: "pos-power",
  title: "Secretario",
  titleFemale: "Secretaria",
  category: "CEL",
  grants: ["Secretary"],
  term: null,
  sigla: null,
  description: "",
  active: true,
  deletedAt: null,
};

/**
 * The cargo Combobox's trigger, scoped to ONE form's container.
 *
 * Selected structurally rather than by id or label, because BOTH forms give their trigger the
 * same `id="cargoId"` (each pairs with its own `<label htmlFor>`) — and that duplicate is not
 * inert: `getByLabelText` and even `container.querySelector("#cargoId")` resolve through
 * `document.getElementById`, which returns the FIRST match document-wide, so the second form's
 * trigger comes back as `null`. That is the exact failure mode a duplicated NOTE id causes for
 * `aria-describedby`, one attribute over — which is why these tests exist, and why they must
 * not be written on top of it.
 */
function cargoTrigger(container: HTMLElement): HTMLElement {
  // The cargo Combobox precedes the comisiones MultiSelect in both forms; both are listbox
  // poppers, so it is the first one.
  const trigger = container.querySelector<HTMLElement>('button[aria-haspopup="listbox"]');
  if (trigger === null) throw new Error("no cargo trigger in this form");
  return trigger;
}

function renderMemberForm(cargoId: string | null) {
  return render(
    <MemberForm
      positions={[POWER_CARGO]}
      defaultValues={{ cargoId }}
      submitLabel="Guardar"
      onSubmit={vi.fn()}
    />,
  ).container;
}

function renderPositionsForm(cargoId: string | null) {
  return render(
    <MemberPositionsForm
      positions={[POWER_CARGO]}
      gender="Femenino"
      allowPowerGrants={false}
      allowReplacePowerCargo={false}
      assignerIsAdmin={false}
      isSelfAssignment={false}
      defaultValues={{ cargoId, comisionIds: [] }}
      onSubmit={vi.fn()}
    />,
  ).container;
}

describe("cargoNoteIds", () => {
  it("returns all four ids, each namespaced by the prefix", () => {
    expect(cargoNoteIds("member")).toEqual({
      noCargos: "member-cargo-no-assignable-note",
      locked: "member-cargo-locked-note",
      takedown: "member-cargo-takedown-note",
      mintPending: "member-cargo-mint-pending-note",
    });
  });

  // BLOCKING: the property the whole helper exists for. Two elements sharing a DOM id makes
  // `aria-describedby` resolve to whichever rendered FIRST — so a screen-reader user on one
  // form's trigger would be read the OTHER form's note. Asserted over the whole id set rather
  // than per key, because the regression that matters is one entry being forgotten while the
  // other three are prefixed.
  it("BLOCKING: shares no id at all between the two forms", () => {
    const member = Object.values(cargoNoteIds("member"));
    const positions = Object.values(cargoNoteIds("positions"));
    expect(new Set([...member, ...positions]).size).toBe(member.length + positions.length);
  });
});

// The unit assertions above pin the STRINGS. These pin that the strings the forms actually
// emit resolve to a real element, in the right form: an id set that is disjoint but points at
// nothing is exactly as broken for a screen reader as one that collides.
describe("cargo note association — both forms mounted at once", () => {
  // The SHARED note. `NoAssignableCargosNote` is one component rendered by both forms, so
  // before it took `id` as a prop this was a hard-coded constant baked into the component and
  // both forms emitted the identical id.
  it("BLOCKING: each form's empty-catalog note resolves inside its OWN form", () => {
    const memberContainer = renderMemberForm(null);
    const positionsContainer = renderPositionsForm(null);

    const memberId = cargoTrigger(memberContainer).getAttribute("aria-describedby");
    const positionsId = cargoTrigger(positionsContainer).getAttribute("aria-describedby");
    expect(memberId).toBe(cargoNoteIds("member").noCargos);
    expect(positionsId).toBe(cargoNoteIds("positions").noCargos);
    expect(memberId).not.toBe(positionsId);

    // `document.getElementById`, not a container query: it is what the accessibility tree
    // does, and it is what returns the WRONG element when two nodes share an id.
    const memberNote = document.getElementById(memberId ?? "");
    const positionsNote = document.getElementById(positionsId ?? "");
    expect(memberNote).not.toBeNull();
    expect(positionsNote).not.toBeNull();
    expect(memberContainer.contains(memberNote)).toBe(true);
    expect(positionsContainer.contains(positionsNote)).toBe(true);
    expect(memberNote).toHaveTextContent(/Ningún cargo del catálogo es asignable/i);
    expect(positionsNote).toHaveTextContent(/Ningún cargo del catálogo es asignable/i);
  });

  // The PER-FORM note, whose wording legitimately differs. Same assertion, and it also pins
  // that each trigger is described by its own form's sentence rather than the other's.
  it("BLOCKING: each form's locked note resolves inside its OWN form", () => {
    const memberContainer = renderMemberForm(POWER_CARGO.id);
    const positionsContainer = renderPositionsForm(POWER_CARGO.id);

    const memberId = cargoTrigger(memberContainer).getAttribute("aria-describedby");
    const positionsId = cargoTrigger(positionsContainer).getAttribute("aria-describedby");
    expect(memberId).toBe(cargoNoteIds("member").locked);
    expect(positionsId).toBe(cargoNoteIds("positions").locked);
    expect(memberId).not.toBe(positionsId);

    const memberNote = document.getElementById(memberId ?? "");
    const positionsNote = document.getElementById(positionsId ?? "");
    expect(memberContainer.contains(memberNote)).toBe(true);
    expect(positionsContainer.contains(positionsNote)).toBe(true);
    // "cambiar EL cargo" vs "cambiar LOS cargos" — the reason these two are not shared.
    expect(memberNote).toHaveTextContent(/puede cambiar el cargo de un miembro/i);
    expect(positionsNote).toHaveTextContent(/puede cambiar los cargos de un miembro/i);
  });

  // No duplicate ids anywhere in the document with both forms up — the general form of the
  // two cases above, so a FIFTH note added to only one form is caught without a new test.
  it("BLOCKING: no id in the document is emitted twice by the two cargo editors", () => {
    renderMemberForm(null);
    renderPositionsForm(null);
    const ids = [...document.querySelectorAll<HTMLElement>("[id]")]
      .map((el) => el.id)
      // The Combobox/MultiSelect triggers deliberately reuse the form-field ids ("cargoId",
      // "comisionIds") to pair with their <label htmlFor>; that collision predates the note
      // ids and is not what this asserts.
      .filter((id) => id !== "cargoId" && id !== "comisionIds");
    expect(new Set(ids).size).toBe(ids.length);
  });
});
