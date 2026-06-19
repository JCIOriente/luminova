import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ActivityForm } from "./activity-form";
import { pickDate } from "../../../test/pick-date";

const NO_OPTIONS = { memberOptions: [], programOptions: [], projectOptions: [] };

describe("ActivityForm", () => {
  it("submits an institutional activity with no parent", async () => {
    const onSubmit = vi.fn();
    render(<ActivityForm {...NO_OPTIONS} onSubmit={onSubmit} isSaving={false} />);
    fireEvent.change(screen.getByLabelText(/título/i), { target: { value: "Asamblea General" } });
    await pickDate(/fecha y hora/i, "2026-06-10");
    fireEvent.click(screen.getByRole("button", { name: /guardar/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ category: "Assembly", parentType: null, parentId: null }),
      expect.anything(),
    );
  });

  it("blocks a ProjectExecution with no parent (Invariant A)", async () => {
    const onSubmit = vi.fn();
    render(<ActivityForm {...NO_OPTIONS} onSubmit={onSubmit} isSaving={false} />);
    fireEvent.change(screen.getByLabelText(/título/i), { target: { value: "Ejecución Test" } });
    fireEvent.change(screen.getByLabelText(/categoría/i), {
      target: { value: "ProjectExecution" },
    });
    await pickDate(/fecha y hora/i, "2026-06-10");
    fireEvent.click(screen.getByRole("button", { name: /guardar/i }));
    await waitFor(() =>
      expect(screen.getByText(/requiere un programa o proyecto/i)).toBeInTheDocument(),
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows the parent picker only for ProjectExecution", async () => {
    const user = userEvent.setup();
    render(
      <ActivityForm
        memberOptions={[]}
        programOptions={[{ value: "pr1", label: "Programa X" }]}
        projectOptions={[{ value: "p1", label: "Proyecto Y" }]}
        isSaving={false}
        onSubmit={() => {}}
      />,
    );
    expect(screen.queryByText("Padre")).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText(/categoría/i), "ProjectExecution");
    expect(screen.getByText("Padre")).toBeInTheDocument();
  });

  it("hides category + parent picker when lockParent is set", () => {
    render(
      <ActivityForm
        lockParent
        defaultValues={{ category: "ProjectExecution", parentType: "Project", parentId: "p1" }}
        memberOptions={[]}
        programOptions={[]}
        projectOptions={[]}
        isSaving={false}
        onSubmit={() => {}}
      />,
    );
    expect(screen.queryByText("Categoría")).not.toBeInTheDocument();
    expect(screen.queryByText("Programa")).not.toBeInTheDocument();
  });
});
