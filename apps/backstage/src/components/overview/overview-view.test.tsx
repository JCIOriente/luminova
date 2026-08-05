import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { OverviewView } from "./overview-view";
import type { DashboardModel } from "./dashboard-model";

function makeModel(overrides: Partial<DashboardModel> = {}): DashboardModel {
  return {
    kpis: {
      activeMembers: { value: 142, trend: undefined },
      upcomingEvents: { value: 3, trend: undefined },
      allies: { value: 6, trend: undefined },
      pointsThisMonth: { value: 88, trend: undefined },
    },
    pointsByMonth: [{ monthKey: "2026-06", label: "Jun", points: 88 }],
    upcomingEvents: [],
    birthdays: [],
    feed: [],
    ...overrides,
  };
}

describe("OverviewView", () => {
  it("renders real KPI values from the model", () => {
    render(
      <OverviewView
        model={makeModel()}
        userName="Camila Áñez"
        now={new Date()}
        roles={["Admin"]}
      />,
    );
    expect(screen.getByText("142")).toBeInTheDocument();
    expect(screen.getByText("6")).toBeInTheDocument();
    expect(screen.getByText("88")).toBeInTheDocument();
    expect(screen.getByText("Miembros activos")).toBeInTheDocument();
    expect(screen.getByText("Aliados")).toBeInTheDocument();
    expect(screen.getByText("Puntos otorgados (mes)")).toBeInTheDocument();
  });

  it("shows honest empty states when lists are empty", () => {
    render(
      <OverviewView
        model={makeModel()}
        userName="Camila Áñez"
        now={new Date()}
        roles={["Admin"]}
      />,
    );
    expect(screen.getByText("No hay eventos próximos.")).toBeInTheDocument();
    expect(screen.getByText("Sin actividad reciente.")).toBeInTheDocument();
    expect(screen.getByText("Sin cumpleaños próximos.")).toBeInTheDocument();
  });

  it("lists upcoming birthdays with a day/month label and no birth year", () => {
    render(
      <OverviewView
        model={makeModel({
          birthdays: [
            { id: "a", name: "Ana Pérez", label: "8 jul", days: 3 },
            { id: "b", name: "Beto Rojas", label: "10 jul", days: 5 },
          ],
        })}
        userName="Camila Áñez"
        now={new Date()}
        roles={["Admin"]}
      />,
    );
    expect(screen.getByText("Ana Pérez")).toBeInTheDocument();
    expect(screen.getByText("8 jul")).toBeInTheDocument();
    expect(screen.getByText("en 3 días")).toBeInTheDocument();
    expect(screen.queryByText(/19\d{2}/)).not.toBeInTheDocument();
  });

  it("omits a null KPI tile entirely instead of rendering it as 0", () => {
    // null = the query behind the tile is gated on a capability this principal lacks and
    // never ran. A 0 there is a fabricated fact (guardrail #3).
    render(
      <OverviewView
        model={makeModel({
          kpis: {
            activeMembers: null,
            upcomingEvents: { value: 3, trend: undefined },
            allies: null,
            pointsThisMonth: { value: 88, trend: undefined },
          },
        })}
        userName="Camila Áñez"
        now={new Date()}
        roles={["Admin"]}
      />,
    );
    expect(screen.queryByText("Aliados")).not.toBeInTheDocument();
    expect(screen.queryByText("Miembros activos")).not.toBeInTheDocument();
    // The ungated tiles still render — the two nulls dropped out, nothing else did.
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Puntos otorgados (mes)")).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("omits the birthdays and activity cards when the members read never ran", () => {
    render(
      <OverviewView
        model={makeModel({ birthdays: null, feed: null })}
        userName="Camila Áñez"
        now={new Date()}
        roles={["Admin"]}
      />,
    );
    expect(screen.queryByText("Próximos cumpleaños")).not.toBeInTheDocument();
    expect(screen.queryByText("Sin cumpleaños próximos.")).not.toBeInTheDocument();
    expect(screen.queryByText("Actividad reciente")).not.toBeInTheDocument();
    expect(screen.queryByText("Sin actividad reciente.")).not.toBeInTheDocument();
  });

  it("greets the user by first name", () => {
    render(
      <OverviewView
        model={makeModel()}
        userName="Camila Áñez"
        now={new Date()}
        roles={["Admin"]}
      />,
    );
    expect(screen.getByRole("heading", { name: /camila/i })).toBeInTheDocument();
  });
});
