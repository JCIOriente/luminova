import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Position } from "@luminova/types";
import { MemberPositionsForm } from "./member-positions-form";
import { permissionLabel } from "../../permissions/lib/permission-matrix";

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
        defaultValues={{ cargoId: null, comisionIds: [] }}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    expect(screen.queryByText(/permisos de administrador/i)).not.toBeInTheDocument();
    await userEvent.click(screen.getByLabelText("Cargo"));
    await userEvent.click(await screen.findByText("presidente"));
    expect(screen.getByText(/permisos de administrador/i)).toBeInTheDocument();
  });

  it("stays silent for an Admin picking that same cargo, who does mint it", async () => {
    render(
      <MemberPositionsForm
        positions={[powerCargo]}
        gender="Masculino"
        allowPowerGrants
        allowReplacePowerCargo={true}
        defaultValues={{ cargoId: null, comisionIds: [] }}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    await userEvent.click(screen.getByLabelText("Cargo"));
    await userEvent.click(await screen.findByText("presidente"));
    expect(screen.queryByText(/permisos de administrador/i)).not.toBeInTheDocument();
  });

  it("shows power-granting cargos to an Admin", async () => {
    render(
      <MemberPositionsForm
        positions={[powerCargo]}
        gender="Masculino"
        allowPowerGrants
        allowReplacePowerCargo={true}
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
    defaultValues: { cargoId: "presidente_libre", comisionIds: [] },
  };

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
        defaultValues={{ cargoId: null, comisionIds: [] }}
        onSubmit={onSubmit}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /guardar/i }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});
