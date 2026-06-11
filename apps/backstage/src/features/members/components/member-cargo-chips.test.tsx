import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Position } from "@luminova/types";
import { MemberCargoChips } from "./member-cargo-chips";

const pos = (id: string, category: Position["category"]): Position => ({
  id, title: id === "pres" ? "Presidente" : "Ética", titleFemale: id === "pres" ? "Presidenta" : "Ética",
  category, grants: [], term: null, description: "", active: true, deletedAt: null,
});
const byId = new Map([pos("pres", "CEL"), pos("etica", "Comision")].map((p) => [p.id, p]));

describe("MemberCargoChips", () => {
  it("renders the gendered cargo + comisión chips", () => {
    render(
      <MemberCargoChips
        member={{ gender: "Femenino", positions: { "2026": { cargoId: "pres", comisionIds: ["etica"] } } }}
        positionsById={byId}
        termKey="2026"
      />,
    );
    expect(screen.getByText("Presidenta")).toBeInTheDocument();
    expect(screen.getByText("Ética")).toBeInTheDocument();
  });
  it("shows a Miembro chip when nothing is assigned", () => {
    render(<MemberCargoChips member={{ positions: {} }} positionsById={byId} termKey="2026" />);
    expect(screen.getByText("Miembro")).toBeInTheDocument();
  });
});
