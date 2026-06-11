import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Position } from "@luminova/types";
import { MemberPositionHistory } from "./member-position-history";

const pos = (id: string, title: string): Position => ({
  id,
  title,
  titleFemale: title,
  sigla: null,
  category: "CEL",
  grants: [],
  term: null,
  description: "",
  active: true,
  deletedAt: null,
});

const comisionPos: Position = {
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

const byId = new Map(
  [pos("tes", "Tesorero"), pos("sec", "Secretario"), comisionPos].map((p) => [p.id, p]),
);

describe("MemberPositionHistory", () => {
  it("lists past terms newest-first, excluding the current term", () => {
    render(
      <MemberPositionHistory
        member={{
          positions: {
            "2026": { cargoId: "sec", comisionIds: [] },
            "2024": { cargoId: "tes", comisionIds: [] },
            "2025": { cargoId: "sec", comisionIds: [] },
          },
        }}
        positionsById={byId}
        currentTermKey="2026"
      />,
    );
    const years = screen.getAllByTestId("history-term").map((el) => el.textContent);
    expect(years).toEqual(["2025", "2024"]);
  });
  it("renders nothing when there is no past history", () => {
    const { container } = render(
      <MemberPositionHistory
        member={{ positions: { "2026": { cargoId: "sec", comisionIds: [] } } }}
        positionsById={byId}
        currentTermKey="2026"
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows comisión sigla as compact chip in history", () => {
    render(
      <MemberPositionHistory
        member={{
          positions: {
            "2026": { cargoId: "sec", comisionIds: ["cce"] },
            "2025": { cargoId: "tes", comisionIds: ["cce"] },
          },
        }}
        positionsById={byId}
        currentTermKey="2026"
      />,
    );
    expect(screen.getByText("CCE")).toBeInTheDocument();
  });
});
