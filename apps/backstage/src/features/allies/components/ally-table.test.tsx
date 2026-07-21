import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { AllyTable } from "./ally-table";
import { roleClaims } from "@luminova/auth/test-helpers";
import { AbilityProvider } from "../../../lib/authz/ability-context";
import type { Ally } from "@luminova/types";

function renderAsAdmin(ui: ReactElement) {
  return render(
    <AbilityProvider claims={roleClaims("Admin")} uid="admin">
      {ui}
    </AbilityProvider>,
  );
}

const ally: Ally = {
  id: "a1",
  companyName: "Equipetrol SRL",
  contactPerson: "Mario Suárez",
  phone: "+591 700 00000",
  email: "mario@equipetrol.bo",
  logoUrl: null,
  category: null,
  active: true,
  deletedAt: null,
};

describe("AllyTable", () => {
  it("renders the company name", () => {
    renderAsAdmin(<AllyTable allies={[ally]} onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText("Equipetrol SRL")).toBeInTheDocument();
  });

  it("renders the logo and category label for a complete ally", () => {
    const complete: Ally = {
      ...ally,
      logoUrl: "https://cdn/logo.png",
      category: "University",
    };
    renderAsAdmin(<AllyTable allies={[complete]} onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByRole("img", { name: /logo de equipetrol srl/i })).toHaveAttribute(
      "src",
      "https://cdn/logo.png",
    );
    expect(screen.getByText("Universidades")).toBeInTheDocument();
  });

  it("calls onDelete when the delete action is used", async () => {
    const onDelete = vi.fn();
    renderAsAdmin(<AllyTable allies={[ally]} onEdit={vi.fn()} onDelete={onDelete} />);
    await userEvent.click(screen.getByRole("button", { name: /eliminar a equipetrol srl/i }));
    expect(onDelete).toHaveBeenCalledWith(ally);
  });

  it("shows an empty state when there are no allies", () => {
    renderAsAdmin(<AllyTable allies={[]} onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText(/no hay aliados/i)).toBeInTheDocument();
  });

  it("hides row actions for a role without write access", () => {
    render(
      <AbilityProvider claims={roleClaims("ExecutiveCommittee")} uid="e">
        <AllyTable allies={[ally]} onEdit={vi.fn()} onDelete={vi.fn()} />
      </AbilityProvider>,
    );
    expect(screen.queryByRole("button", { name: /editar a equipetrol srl/i })).toBeNull();
  });
});
