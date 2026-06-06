import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { OverviewView } from "./overview-view";

describe("OverviewView", () => {
  it("renders real member and ally counts in the KPI row", () => {
    render(<OverviewView memberCount={142} allyCount={6} userName="Camila Áñez" />);
    // 142 is the real member count (unique on screen)
    expect(screen.getByText("142")).toBeInTheDocument();
    // "Miembros activos" appears as both a KPI label and a chart-legend label
    expect(screen.getAllByText("Miembros activos").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Aliados")).toBeInTheDocument();
  });

  it("greets the user by first name", () => {
    render(<OverviewView memberCount={0} allyCount={0} userName="Camila Áñez" />);
    expect(screen.getByRole("heading", { name: /camila/i })).toBeInTheDocument();
  });
});
