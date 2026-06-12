import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ImpactBand } from "./impact-band";

describe("ImpactBand", () => {
  it("shows persons + volunteers + custom metrics", () => {
    render(
      <ImpactBand
        impact={{
          personsImpacted: 1200,
          volunteers: 30,
          custom: [{ label: "Juguetes", value: "1.200" }],
          closingSummary: "ok",
        }}
      />,
    );
    expect(screen.getByText(/1.200|1,200/)).toBeInTheDocument();
    expect(screen.getByText("Juguetes")).toBeInTheDocument();
  });
});
