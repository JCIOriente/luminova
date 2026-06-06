import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ActivityForm } from "./activity-form";

describe("ActivityForm", () => {
  it("submits an institutional activity with no parent", async () => {
    const onSubmit = vi.fn();
    render(<ActivityForm onSubmit={onSubmit} isSaving={false} />);
    fireEvent.change(screen.getByLabelText(/fecha y hora/i), {
      target: { value: "2026-06-10T18:30" },
    });
    fireEvent.click(screen.getByRole("button", { name: /guardar/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ category: "Assembly", parentType: null, parentId: null }),
      expect.anything(),
    );
  });

  it("blocks a ProjectExecution with no parent (Invariant A)", async () => {
    const onSubmit = vi.fn();
    render(<ActivityForm onSubmit={onSubmit} isSaving={false} />);
    fireEvent.change(screen.getByLabelText(/categoría/i), {
      target: { value: "ProjectExecution" },
    });
    fireEvent.change(screen.getByLabelText(/fecha y hora/i), {
      target: { value: "2026-06-10T18:30" },
    });
    fireEvent.click(screen.getByRole("button", { name: /guardar/i }));
    await waitFor(() =>
      expect(screen.getByText(/requiere un programa o proyecto/i)).toBeInTheDocument(),
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
