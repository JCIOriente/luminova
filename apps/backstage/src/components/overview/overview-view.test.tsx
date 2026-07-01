import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { OverviewView } from "./overview-view";
import type { DashboardModel } from "./dashboard-model";

function makeModel(overrides: Partial<DashboardModel> = {}): DashboardModel {
  return {
    kpis: {
      activeMembers: { label: "Miembros activos", value: 142, trend: undefined },
      upcomingEvents: { label: "Próximos eventos", value: 3, trend: undefined },
      allies: { label: "Aliados", value: 6, trend: undefined },
      pointsThisMonth: { label: "Puntos otorgados (mes)", value: 88, trend: undefined },
    },
    pointsByMonth: [{ monthKey: "2026-06", label: "Jun", points: 88 }],
    upcomingEvents: [],
    feed: [],
    ...overrides,
  };
}

describe("OverviewView", () => {
  it("renders real KPI values from the model", () => {
    render(<OverviewView model={makeModel()} userName="Camila Áñez" />);
    expect(screen.getByText("142")).toBeInTheDocument();
    expect(screen.getByText("Miembros activos")).toBeInTheDocument();
    expect(screen.getByText("Aliados")).toBeInTheDocument();
    expect(screen.getByText("Puntos otorgados (mes)")).toBeInTheDocument();
  });

  it("shows honest empty states when lists are empty", () => {
    render(<OverviewView model={makeModel()} userName="Camila Áñez" />);
    expect(screen.getByText("No hay eventos próximos.")).toBeInTheDocument();
    expect(screen.getByText("Sin actividad reciente.")).toBeInTheDocument();
  });

  it("greets the user by first name", () => {
    render(<OverviewView model={makeModel()} userName="Camila Áñez" />);
    expect(screen.getByRole("heading", { name: /camila/i })).toBeInTheDocument();
  });
});
