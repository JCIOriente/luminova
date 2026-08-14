import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Position } from "@luminova/types";
import { MemberPositionsForm } from "./member-positions-form";

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
        defaultValues={{ cargoId: null, comisionIds: [] }}
        onSubmit={onSubmit}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /guardar/i }));
    expect(onSubmit).toHaveBeenCalledWith({ cargoId: null, comisionIds: [] });
  });

  it("submits selected cargo and comisiones", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <MemberPositionsForm
        positions={positions}
        gender="Masculino"
        allowPowerGrants={false}
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
        defaultValues={{ cargoId: null, comisionIds: [] }}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    await userEvent.click(screen.getByLabelText("Cargo"));
    expect(screen.queryByText("presidente")).not.toBeInTheDocument();
  });

  it("shows power-granting cargos to an Admin", async () => {
    render(
      <MemberPositionsForm
        positions={[powerCargo]}
        gender="Masculino"
        allowPowerGrants
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
        defaultValues={{ cargoId: "presidente", comisionIds: [] }}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    expect(screen.getByRole("button", { name: /guardar/i })).toBeDisabled();
    expect(screen.getByText(/Solo un Admin puede cambiar los cargos/i)).toBeInTheDocument();
  });

  it("does NOT lock when the editor may assign power grants (Admin)", () => {
    render(
      <MemberPositionsForm
        positions={[powerCargo]}
        gender="Masculino"
        allowPowerGrants
        defaultValues={{ cargoId: "presidente", comisionIds: [] }}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    expect(screen.getByRole("button", { name: /guardar/i })).not.toBeDisabled();
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
  it("BLOCKING: does NOT lock a grant-free CEL seat — clearing it is the allowed takedown", () => {
    render(
      <MemberPositionsForm
        positions={[celFree, pos("etica", "Comision")]}
        gender="Masculino"
        allowPowerGrants={false}
        defaultValues={{ cargoId: "presidente_libre", comisionIds: [] }}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    expect(screen.getByRole("button", { name: /guardar/i })).toBeEnabled();
    // Not offered either — keeping it is what the rules deny, so the only submittable
    // states are "cleared" or "some other assignable cargo".
    expect(screen.queryByText(/Presidente/i)).not.toBeInTheDocument();
  });

  it("locks the form for a non-Admin when the current cargo GRANTS power (nothing succeeds)", () => {
    const granting: Position = { ...pos("tesorero", "CEL"), grants: ["Treasury"] };
    render(
      <MemberPositionsForm
        positions={[granting, pos("etica", "Comision")]}
        gender="Masculino"
        allowPowerGrants={false}
        defaultValues={{ cargoId: "tesorero", comisionIds: [] }}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    expect(screen.getByRole("button", { name: /guardar/i })).toBeDisabled();
    expect(screen.getByText(/Solo un Admin puede cambiar los cargos/i)).toBeInTheDocument();
  });

  it("does NOT lock a non-Admin editing a member seated on a grant-free JDL dirección", () => {
    render(
      <MemberPositionsForm
        positions={positions}
        gender="Masculino"
        allowPowerGrants={false}
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
        defaultValues={{ cargoId: null, comisionIds: [] }}
        onSubmit={onSubmit}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /guardar/i }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});
