import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InitiativeForm } from "./initiative-form";

const members = [
  { value: "m1", label: "Ana Rivas" },
  { value: "m2", label: "Bruno Paz" },
];

describe("InitiativeForm", () => {
  it("submits title + director + status", async () => {
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
    await user.click(screen.getByRole("button", { name: /^director/i }));
    await user.click(screen.getByText("Ana Rivas"));
    await user.click(screen.getByRole("button", { name: /crear/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      title: "Proyecto Aurora",
      roster: { directorId: "m1", coDirectorId: null, teamIds: [] },
      status: "Planificacion",
    });
  });

  it("blocks submit when the director is missing", async () => {
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
});
