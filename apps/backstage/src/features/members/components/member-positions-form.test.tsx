import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Position } from "@luminova/types";
import { MemberPositionsForm } from "./member-positions-form";
import { cargoNoteIds } from "./no-assignable-cargos-note";
import { permissionLabel } from "../../permissions/lib/permission-matrix";

// Through the same helper the form calls, not a hand-typed literal: the ids are no longer
// exported individually, and a test that re-typed one would keep passing after a rename.
const MINT_PENDING_NOTE_ID = cargoNoteIds("positions").mintPending;

// The mint-pending note used to say "permisos de administrador", which was true only of its
// one original trigger. It now fires for a SELF-assignment of any granting cargo — a
// Secretario, say — so copy naming administrator permissions would be a lie in that case.
// Matched on the outcome half of the sentence, which is the part both triggers share.
const MINT_PENDING_COPY = /no se aplicarán hasta que un administrador confirme la asignación/i;

// The note names the permission through `permissionLabel`, and its own comment says the two
// features must not drift. Assert against the same source, not a hardcoded copy — a literal
// here would keep passing after either half of the label is renamed, which is exactly the
// coupling the note is worried about.
const BOARD_SEAT_LABEL = permissionLabel("update:BoardSeat");

const pos = (id: string, category: Position["category"]): Position => ({
  id,
  title: id,
  titleFemale: id,
  category,
  grants: [],
  term: category === "JDL" ? 2026 : null,
  description: "",
  active: true,
  deletedAt: null,
});
const positions = [pos("dir", "JDL"), pos("etica", "Comision")];

describe("MemberPositionsForm", () => {
  it("submits the current cargo + comisiones unchanged when saved as-is", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <MemberPositionsForm
        positions={positions}
        gender="Masculino"
        allowPowerGrants={false}
        allowReplacePowerCargo={false}
        assignerIsAdmin={false}
        isSelfAssignment={false}
        defaultValues={{ cargoId: null, comisionIds: [] }}
        onSubmit={onSubmit}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /guardar/i }));
    expect(onSubmit).toHaveBeenCalledWith({ cargoId: null, comisionIds: [] });
  });

  it("explains an empty cargo list to a non-delegate, and never doubles up with the locked note", async () => {
    // A catalog of only CEL / power-granting cargos — the real production shape, and the
    // state that made the picker silently empty.
    const gated: Position[] = [
      { ...pos("presi", "CEL"), grants: [] },
      { ...pos("power", "JDL"), grants: ["Membership"] },
    ];
    const { unmount } = render(
      <MemberPositionsForm
        positions={gated}
        gender="Masculino"
        allowPowerGrants={false}
        allowReplacePowerCargo={false}
        assignerIsAdmin={false}
        isSelfAssignment={false}
        defaultValues={{ cargoId: null, comisionIds: [] }}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByRole("note")).toHaveTextContent(BOARD_SEAT_LABEL);
    unmount();

    // A delegate assigns the same catalog: no note.
    const asDelegate = render(
      <MemberPositionsForm
        positions={gated}
        gender="Masculino"
        allowPowerGrants
        allowReplacePowerCargo={false}
        assignerIsAdmin={false}
        isSelfAssignment={false}
        defaultValues={{ cargoId: null, comisionIds: [] }}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    asDelegate.unmount();

    // Locked (seated on a power cargo) renders the LOCKED note and not this one. They are
    // mutually exclusive today only because cargoOptionsForEditor appends the held cargo,
    // making the list non-empty — pin it so a change there cannot produce two notes.
    render(
      <MemberPositionsForm
        positions={gated}
        gender="Masculino"
        allowPowerGrants={false}
        allowReplacePowerCargo={false}
        assignerIsAdmin={false}
        isSelfAssignment={false}
        defaultValues={{ cargoId: "power", comisionIds: [] }}
        onSubmit={vi.fn()}
      />,
    );
    const notes = screen.getAllByRole("note");
    expect(notes).toHaveLength(1);
    expect(notes[0]).toHaveTextContent(/Solo un administrador/);
  });

  it("submits selected cargo and comisiones", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <MemberPositionsForm
        positions={positions}
        gender="Masculino"
        allowPowerGrants={false}
        allowReplacePowerCargo={false}
        assignerIsAdmin={false}
        isSelfAssignment={false}
        defaultValues={{ cargoId: null, comisionIds: [] }}
        onSubmit={onSubmit}
      />,
    );
    await userEvent.click(screen.getByLabelText("Cargo"));
    await userEvent.click(await screen.findByText("dir"));
    await userEvent.click(screen.getByLabelText("Comisiones"));
    await userEvent.click(await screen.findByText("etica"));
    await userEvent.click(screen.getByRole("button", { name: /guardar/i }));
    expect(onSubmit).toHaveBeenCalledWith({ cargoId: "dir", comisionIds: ["etica"] });
  });

  it("labels comisión options by sigla, never a gendered title (female member)", async () => {
    const cce: Position = {
      id: "cce",
      title: "Comisión de Conducta y Ética",
      titleFemale: null,
      sigla: "CCE",
      category: "Comision",
      grants: [],
      term: null,
      description: "",
      active: true,
      deletedAt: null,
    };
    render(
      <MemberPositionsForm
        positions={[cce]}
        gender="Femenino"
        allowPowerGrants={false}
        allowReplacePowerCargo={false}
        assignerIsAdmin={false}
        isSelfAssignment={false}
        defaultValues={{ cargoId: null, comisionIds: [] }}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    await userEvent.click(screen.getByLabelText("Comisiones"));
    expect(await screen.findByText("CCE — Comisión de Conducta y Ética")).toBeInTheDocument();
    expect(screen.queryByText(/Comisióna/)).not.toBeInTheDocument();
  });

  const powerCargo: Position = { ...pos("presidente", "CEL"), grants: ["Admin"] };

  it("hides power-granting cargos from a non-Admin", async () => {
    render(
      <MemberPositionsForm
        positions={[powerCargo]}
        gender="Masculino"
        allowPowerGrants={false}
        allowReplacePowerCargo={false}
        assignerIsAdmin={false}
        isSelfAssignment={false}
        defaultValues={{ cargoId: null, comisionIds: [] }}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    await userEvent.click(screen.getByLabelText("Cargo"));
    expect(screen.queryByText("presidente")).not.toBeInTheDocument();
  });

  // The silent outcome. A delegate may WRITE this seat — boardSeatDelegate() allows it and
  // the save succeeds — but resolveTrustedGrants refuses an Admin-granting cargo from a
  // non-Admin assigner, so the member is seated with no Admin claim and nothing else says so.
  it("BLOCKING: warns a delegate that an Admin-granting cargo mints nothing until an Admin confirms", async () => {
    render(
      <MemberPositionsForm
        positions={[powerCargo]}
        gender="Masculino"
        allowPowerGrants
        allowReplacePowerCargo={false}
        assignerIsAdmin={false}
        isSelfAssignment={false}
        defaultValues={{ cargoId: null, comisionIds: [] }}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    expect(screen.queryByText(MINT_PENDING_COPY)).not.toBeInTheDocument();
    await userEvent.click(screen.getByLabelText("Cargo"));
    await userEvent.click(await screen.findByText("presidente"));
    expect(screen.getByText(MINT_PENDING_COPY)).toBeInTheDocument();
  });

  it("stays silent for an Admin picking that same cargo, who does mint it", async () => {
    render(
      <MemberPositionsForm
        positions={[powerCargo]}
        gender="Masculino"
        allowPowerGrants
        allowReplacePowerCargo={true}
        assignerIsAdmin={true}
        isSelfAssignment={false}
        defaultValues={{ cargoId: null, comisionIds: [] }}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    await userEvent.click(screen.getByLabelText("Cargo"));
    await userEvent.click(await screen.findByText("presidente"));
    expect(screen.queryByText(MINT_PENDING_COPY)).not.toBeInTheDocument();
  });

  // ---- self-assignment: the second, disjoint refusal in resolveTrustedGrants ----
  //
  // BLOCKING: the finding. A delegate holding update:Position + update:BoardSeat opens THEIR
  // OWN profile and seats themselves on a vacant NON-Admin-granting power cargo. Every gate
  // above says yes: boardSeatDelegate() permits the write, the seat publishes to the
  // Directiva, and the save returns 200. But `resolveTrustedGrants` computes
  // `selfAssigned = assignedBy === memberUid` and honors it only for an Admin, so no claim is
  // minted. syncMemberClaims is a background trigger — no response carries the refusal — and
  // before this the warning keyed on `grants.includes("Admin")` alone, so a Secretario seat
  // rendered NO note at all. The picker is the only place this can be said.
  const selfCargo: Position = { ...pos("secretario", "CEL"), grants: ["Secretary"] };

  const seatSelf = async () => {
    await userEvent.click(screen.getByLabelText("Cargo"));
    await userEvent.click(await screen.findByText("secretario"));
  };

  it("BLOCKING: warns a delegate seating THEMSELVES on a non-Admin power cargo", async () => {
    render(
      <MemberPositionsForm
        positions={[selfCargo]}
        gender="Masculino"
        allowPowerGrants
        allowReplacePowerCargo={false}
        assignerIsAdmin={false}
        isSelfAssignment
        defaultValues={{ cargoId: null, comisionIds: [] }}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    expect(screen.queryByText(MINT_PENDING_COPY)).not.toBeInTheDocument();
    await seatSelf();
    const note = screen.getByText(MINT_PENDING_COPY);
    expect(note).toBeInTheDocument();
    // The note sits after the field in the DOM, so the association is the only way a
    // screen-reader user on the trigger meets it before committing the save.
    expect(note.id).toBe(MINT_PENDING_NOTE_ID);
    expect(screen.getByLabelText("Cargo")).toHaveAttribute(
      "aria-describedby",
      MINT_PENDING_NOTE_ID,
    );
    // The copy must not name administrator permissions: this cargo grants Secretary.
    expect(note).not.toHaveTextContent(/permisos de administrador/i);
    // And the seat is still assignable — the write succeeds, which is exactly why the note
    // has to explain what will NOT follow it.
    expect(screen.getByRole("button", { name: /guardar/i })).toBeEnabled();
  });

  it("BLOCKING: the SAME delegate on the SAME cargo for someone else stays silent", async () => {
    // The control that makes the case above about self-assignment and nothing else. Identical
    // props but `isSelfAssignment={false}`: update:BoardSeat DOES mint a Secretary seat for
    // another member, so a note here would be false and would train users past the real one.
    render(
      <MemberPositionsForm
        positions={[selfCargo]}
        gender="Masculino"
        allowPowerGrants
        allowReplacePowerCargo={false}
        assignerIsAdmin={false}
        isSelfAssignment={false}
        defaultValues={{ cargoId: null, comisionIds: [] }}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    await seatSelf();
    expect(screen.queryByText(MINT_PENDING_COPY)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Cargo")).not.toHaveAttribute("aria-describedby");
  });

  it("stays silent for an ADMIN seating themselves — they mint it", async () => {
    // `assignerIsAdmin` satisfies both arms of the trust gate, so self-assignment is not a
    // refusal for them. Without this cell the fix could be "warn on any self-assignment".
    render(
      <MemberPositionsForm
        positions={[selfCargo]}
        gender="Masculino"
        allowPowerGrants
        allowReplacePowerCargo={true}
        assignerIsAdmin={true}
        isSelfAssignment
        defaultValues={{ cargoId: null, comisionIds: [] }}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    await seatSelf();
    expect(screen.queryByText(MINT_PENDING_COPY)).not.toBeInTheDocument();
  });

  it("shows power-granting cargos to an Admin", async () => {
    render(
      <MemberPositionsForm
        positions={[powerCargo]}
        gender="Masculino"
        allowPowerGrants
        allowReplacePowerCargo={true}
        assignerIsAdmin={true}
        isSelfAssignment={false}
        defaultValues={{ cargoId: null, comisionIds: [] }}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    await userEvent.click(screen.getByLabelText("Cargo"));
    expect(await screen.findByText("presidente")).toBeInTheDocument();
  });

  it("locks the form for a non-Admin editing a member whose assigned cargo grants power", () => {
    render(
      <MemberPositionsForm
        positions={[powerCargo]}
        gender="Masculino"
        allowPowerGrants={false}
        allowReplacePowerCargo={false}
        assignerIsAdmin={false}
        isSelfAssignment={false}
        defaultValues={{ cargoId: "presidente", comisionIds: [] }}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    expect(screen.getByRole("button", { name: /guardar/i })).toBeDisabled();
    expect(screen.getByText(/Solo un administrador puede cambiar los cargos/i)).toBeInTheDocument();
  });

  it("does NOT lock when the editor may assign power grants (Admin)", () => {
    render(
      <MemberPositionsForm
        positions={[powerCargo]}
        gender="Masculino"
        allowPowerGrants
        allowReplacePowerCargo={true}
        assignerIsAdmin={true}
        isSelfAssignment={false}
        defaultValues={{ cargoId: "presidente", comisionIds: [] }}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    expect(screen.getByRole("button", { name: /guardar/i })).not.toBeDisabled();
  });

  // BLOCKING: the two rules conjuncts of positionsAssignmentSafe() are gated on DIFFERENT
  // principals. `update:BoardSeat` lifts the NEW side (cargoAssignableByNonAdmin, the cargo
  // written in) — which is what `allowPowerGrants` carries — but the OLD side
  // (currentCargoGrantsEmpty, the cargo being REPLACED) is Admin-ROLE only and is deliberately
  // NOT delegated. So the delegate is the one principal for whom both flags disagree, and the
  // form must still lock. While the lock was `!allowPowerGrants && locked(...)` this render
  // handed a delegate an open picker on a write the rules ALWAYS deny: render-then-403.
  it("BLOCKING: locks for a board-seat DELEGATE on a member seated on a power-granting cargo", () => {
    render(
      <MemberPositionsForm
        positions={[powerCargo]}
        gender="Masculino"
        allowPowerGrants
        allowReplacePowerCargo={false}
        assignerIsAdmin={false}
        isSelfAssignment={false}
        defaultValues={{ cargoId: "presidente", comisionIds: [] }}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    const trigger = screen.getByLabelText("Cargo");
    expect(trigger).toBeDisabled();
    const note = screen.getByText(/Solo un administrador puede cambiar los cargos/i);
    expect(note).toBeInTheDocument();
    // The note sits after the field in the DOM, so the association is the only way a
    // screen-reader user reaching a disabled trigger meets the reason.
    expect(trigger).toHaveAttribute("aria-describedby", note.id);
    expect(screen.getByRole("button", { name: /guardar/i })).toBeDisabled();
  });

  // The publication half of the mirror. pos_cel_free is grant-free, so the grants filter
  // alone still offered it: a non-Admin picked 'Presidente' and the save 403'd on the rules'
  // `category != 'CEL'` conjunct with a generic error.
  const celFree = pos("presidente_libre", "CEL");

  it("hides a grant-free CEL cargo from a non-Admin", async () => {
    render(
      <MemberPositionsForm
        positions={[celFree, pos("dir", "JDL")]}
        gender="Masculino"
        allowPowerGrants={false}
        allowReplacePowerCargo={false}
        assignerIsAdmin={false}
        isSelfAssignment={false}
        defaultValues={{ cargoId: null, comisionIds: [] }}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    await userEvent.click(screen.getByLabelText("Cargo"));
    // The paired JDL dirección proves the filter is the CEL conjunct, not the list closing
    // on grant-free board cargos generally — that exposure is accepted and must survive.
    expect(await screen.findByText("dir")).toBeInTheDocument();
    expect(screen.queryByText("presidente_libre")).not.toBeInTheDocument();
  });

  it("shows a grant-free CEL cargo to an Admin", async () => {
    render(
      <MemberPositionsForm
        positions={[celFree]}
        gender="Masculino"
        allowPowerGrants
        allowReplacePowerCargo={true}
        assignerIsAdmin={true}
        isSelfAssignment={false}
        defaultValues={{ cargoId: null, comisionIds: [] }}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    await userEvent.click(screen.getByLabelText("Cargo"));
    expect(await screen.findByText("presidente_libre")).toBeInTheDocument();
  });

  // Not just the option list: `locked` has to cover it too. Every save re-stamps the
  // assigned cargoId into the merged doc, so with the form unlocked a comisiones-only edit
  // on a CEL-seated member is denied — no lock, no note, one generic error.
  // BLOCKING: the two rules conjuncts are asymmetric, so the client must not mirror the
  // wrong one. `cargoAssignableByNonAdmin()` denies KEEPING a grant-free CEL seat, but
  // `currentCargoGrantsEmpty()` is deliberately not category-gated, so CLEARING it is
  // allowed — firestore.rules says denying that "would strand a takedown behind an Admin".
  // Locking the form here would strand exactly that takedown in the UI instead.
  const celSeatedProps = {
    positions: [celFree, pos("etica", "Comision")],
    gender: "Masculino" as const,
    allowPowerGrants: false,
    allowReplacePowerCargo: false,
    assignerIsAdmin: false,
    isSelfAssignment: false,
    defaultValues: { cargoId: "presidente_libre", comisionIds: [] },
  };

  // BLOCKING: the takedown note now has an id and is the third arm of cargoNoteId(). While
  // the association was a two-branch ternary over noCargos/locked, a takedown-only editor got
  // `aria-describedby={undefined}`: the note rendered, sat AFTER the field in the DOM, and a
  // screen-reader user reaching a trigger whose only option is disabled met no reason at all.
  it("BLOCKING: associates the takedown note with the trigger", () => {
    render(<MemberPositionsForm {...celSeatedProps} onSubmit={vi.fn()} />);
    const note = screen.getByText(/solo un administrador puede asignarlo/i);
    expect(note.id).toBeTruthy();
    expect(screen.getByLabelText("Cargo")).toHaveAttribute("aria-describedby", note.id);
    // Not the mint-pending id: a grant-free seat mints nothing to warn about, and the two
    // notes' ids must not be interchangeable.
    expect(note.id).not.toBe(MINT_PENDING_NOTE_ID);
  });

  // Dropping the seat from the options was half a mirror: it left the CEL cargoId as the RHF
  // value with no option to render it, so the trigger showed the "Sin cargo" PLACEHOLDER for a
  // seated member, saving as-is re-submitted the cargoId into a 403, and Combobox's clear
  // gesture (re-select the selected option) was unreachable because that option did not exist.
  it("BLOCKING: names the grant-free CEL seat a non-Admin holds instead of 'Sin cargo'", () => {
    render(<MemberPositionsForm {...celSeatedProps} onSubmit={vi.fn()} />);
    expect(screen.getByLabelText("Cargo")).toHaveTextContent("presidente_libre");
    // Not locked — the takedown stays open — but not savable while the seat is kept either.
    expect(
      screen.queryByText(/Solo un administrador puede cambiar los cargos/i),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /guardar/i })).toBeDisabled();
  });

  it("BLOCKING: reaches the takedown a grant-free CEL seat allows and submits cargoId null", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<MemberPositionsForm {...celSeatedProps} onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole("button", { name: /quitar cargo/i }));
    expect(screen.getByLabelText("Cargo")).toHaveTextContent("Sin cargo");
    const save = screen.getByRole("button", { name: /guardar/i });
    expect(save).toBeEnabled();
    await userEvent.click(save);
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ cargoId: null, comisionIds: [] }));
  });

  it("BLOCKING: a non-Admin cannot re-assign the grant-free CEL seat once cleared", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<MemberPositionsForm {...celSeatedProps} onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole("button", { name: /quitar cargo/i }));
    await userEvent.click(screen.getByLabelText("Cargo"));
    const seat = await screen.findByRole("option", { name: "presidente_libre" });
    expect(seat).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(seat);
    await userEvent.keyboard("{Escape}");
    expect(screen.getByLabelText("Cargo")).toHaveTextContent("Sin cargo");
    await userEvent.click(screen.getByRole("button", { name: /guardar/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ cargoId: null, comisionIds: [] }));
  });

  it("locks the form for a non-Admin when the current cargo GRANTS power (nothing succeeds)", () => {
    const granting: Position = { ...pos("tesorero", "CEL"), grants: ["Treasury"] };
    render(
      <MemberPositionsForm
        positions={[granting, pos("etica", "Comision")]}
        gender="Masculino"
        allowPowerGrants={false}
        allowReplacePowerCargo={false}
        assignerIsAdmin={false}
        isSelfAssignment={false}
        defaultValues={{ cargoId: "tesorero", comisionIds: [] }}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    expect(screen.getByRole("button", { name: /guardar/i })).toBeDisabled();
    expect(screen.getByText(/Solo un administrador puede cambiar los cargos/i)).toBeInTheDocument();
  });

  it("does NOT lock a non-Admin editing a member seated on a grant-free JDL dirección", () => {
    render(
      <MemberPositionsForm
        positions={positions}
        gender="Masculino"
        allowPowerGrants={false}
        allowReplacePowerCargo={false}
        assignerIsAdmin={false}
        isSelfAssignment={false}
        defaultValues={{ cargoId: "dir", comisionIds: [] }}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    expect(screen.getByRole("button", { name: /guardar/i })).not.toBeDisabled();
  });

  it("shows error alert when onSubmit throws", async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error("fail"));
    render(
      <MemberPositionsForm
        positions={positions}
        gender="Masculino"
        allowPowerGrants={false}
        allowReplacePowerCargo={false}
        assignerIsAdmin={false}
        isSelfAssignment={false}
        defaultValues={{ cargoId: null, comisionIds: [] }}
        onSubmit={onSubmit}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /guardar/i }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});
