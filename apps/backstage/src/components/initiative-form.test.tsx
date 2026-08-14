import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InitiativeForm } from "./initiative-form";
import { pickDate } from "../test/pick-date";

const members = [
  { value: "m1", label: "Ana Rivas" },
  { value: "m2", label: "Bruno Paz" },
];

describe("InitiativeForm", () => {
  it("submits with all required fields filled", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <InitiativeForm
        memberOptions={members}
        submitLabel="Crear"
        isSaving={false}
        onSubmit={onSubmit}
      />,
    );

    await user.type(screen.getByLabelText(/título/i), "Proyecto Aurora");
    await user.type(
      screen.getByLabelText(/descripción/i),
      "Una descripción larga para superar validación",
    );
    await pickDate(/inicio/i, "2026-02-15");
    await pickDate(/cierre estimado/i, "2026-08-15");
    await user.click(screen.getByRole("button", { name: /^director/i }));
    await user.click(screen.getByText("Ana Rivas"));
    await user.click(screen.getByRole("button", { name: /crear/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      title: "Proyecto Aurora",
      roster: { directorId: "m1", coDirectorIds: [], teamIds: [] },
      status: "Planificacion",
    });
  });

  it("blocks submit when required fields are missing", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <InitiativeForm
        memberOptions={members}
        submitLabel="Crear"
        isSaving={false}
        onSubmit={onSubmit}
      />,
    );
    await user.type(screen.getByLabelText(/título/i), "Proyecto Aurora");
    await user.click(screen.getByRole("button", { name: /crear/i }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("never offers Finalizado as a selectable status", () => {
    render(
      <InitiativeForm
        memberOptions={[]}
        submitLabel="Guardar"
        isSaving={false}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.queryByRole("option", { name: /completado/i })).not.toBeInTheDocument();
  });

  it("locks status to a read-only pill when finalReport is filed", () => {
    render(
      <InitiativeForm
        memberOptions={[]}
        submitLabel="Guardar"
        isSaving={false}
        onSubmit={vi.fn()}
        lockStatus
        defaultValues={{ status: "Finalizado" }}
      />,
    );
    expect(screen.queryByLabelText("Estado")).not.toBeInTheDocument();
    expect(screen.getByText(/no se puede reabrir/i)).toBeInTheDocument();
  });

  // `featured` curation is gated (rules' canCurateFeatured): Admin by role, everyone else by
  // the update:Showcase perm. A non-curator must not even see the control — the write would
  // be denied by firestore.rules, taking the whole save down with it.
  it("renders the destacar checkbox only when the caller may curate", () => {
    const { unmount } = render(
      <InitiativeForm
        memberOptions={[]}
        submitLabel="Guardar"
        isSaving={false}
        onSubmit={vi.fn()}
        canFeature
      />,
    );
    expect(screen.getByLabelText(/destacar en \/programas/i)).toBeInTheDocument();
    unmount();

    render(
      <InitiativeForm
        memberOptions={[]}
        submitLabel="Guardar"
        isSaving={false}
        onSubmit={vi.fn()}
        canFeature={false}
      />,
    );
    expect(screen.queryByLabelText(/destacar en \/programas/i)).not.toBeInTheDocument();
  });

  it("hides the destacar checkbox when canFeature is not passed at all", () => {
    render(
      <InitiativeForm
        memberOptions={[]}
        submitLabel="Guardar"
        isSaving={false}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText(/destacar en \/programas/i)).not.toBeInTheDocument();
  });
});
