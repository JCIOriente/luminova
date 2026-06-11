import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Position } from "@luminova/types";
import { MemberPositionHistory } from "./member-position-history";

const pos = (id: string, title: string): Position => ({
  id,
  title,
  titleFemale: title,
  category: "CEL",
  grants: [],
  term: null,
  description: "",
  active: true,
  deletedAt: null,
});
const byId = new Map([pos("tes", "Tesorero"), pos("sec", "Secretario")].map((p) => [p.id, p]));

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
});
