import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ImpactBand } from "./impact-band";

describe("ImpactBand", () => {
  it("shows persons + volunteers with es-BO grouping", () => {
    render(<ImpactBand impact={{ personsImpacted: 3500, volunteers: 42, custom: [], closingSummary: "ok" }} />);
    expect(screen.getByText(/3.500|3,500/)).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
  });
  it("renders custom metric values verbatim (no reformatting)", () => {
    render(<ImpactBand impact={{ personsImpacted: 10, volunteers: 2, custom: [{ label: "Juguetes", value: "1.200" }, { label: "Recaudado", value: "Bs. 4.500" }], closingSummary: "ok" }} />);
    expect(screen.getByText("Juguetes")).toBeInTheDocument();
    expect(screen.getByText("1.200")).toBeInTheDocument();      // verbatim, NOT "1,2"
    expect(screen.getByText("Bs. 4.500")).toBeInTheDocument();
  });
});
