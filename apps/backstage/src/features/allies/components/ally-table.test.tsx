import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AllyTable } from "./ally-table";
import type { Ally } from "../types/ally";

const ally: Ally = {
  id: "a1",
  companyName: "Equipetrol SRL",
  personInCharge: "Mario Suárez",
  phone: "+591 700 00000",
  email: "mario@equipetrol.bo",
} as Ally;

describe("AllyTable", () => {
  it("renders the company name", () => {
    render(<AllyTable allies={[ally]} onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText("Equipetrol SRL")).toBeInTheDocument();
  });

  it("calls onDelete when the delete action is used", async () => {
    const onDelete = vi.fn();
    render(<AllyTable allies={[ally]} onEdit={vi.fn()} onDelete={onDelete} />);
    await userEvent.click(screen.getByRole("button", { name: /eliminar a equipetrol srl/i }));
    expect(onDelete).toHaveBeenCalledWith(ally);
  });

  it("shows an empty state when there are no allies", () => {
    render(<AllyTable allies={[]} onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText(/no hay aliados/i)).toBeInTheDocument();
  });
});
