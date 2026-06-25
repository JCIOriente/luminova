import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Timestamp } from "firebase/firestore";
import type { InitiativeKind, Participation } from "@luminova/types/engine";
import { ParticipationLedger } from "./participation-ledger";
import { summarizeParticipations } from "../lib/participation-summary";

function row(overrides: Partial<Participation>): Participation {
  return {
    id: "r1",
    memberId: "m1",
    termId: "2026",
    activityId: "a1",
    parentType: "Program",
    parentId: "p1",
    role: "Director",
    pointRuleCode: "DirectProgram",
    basePoints: 10,
    punctualityFactor: 1,
    computedPoints: 10,
    monthBucket: "2026-06",
    state: "confirmed",
    gates: { attendanceRegistered: true, finalReportFiled: true },
    checkInAt: Timestamp.fromDate(new Date("2026-06-06T18:00:00Z")),
    voidReason: null,
    createdAt: Timestamp.fromDate(new Date("2026-06-06T18:00:00Z")),
    ...overrides,
  };
}

const activities = [
  { id: "a1", title: "Lanzamiento del programa" },
  { id: "a2", title: "Asamblea general" },
  { id: "a3", title: "Reunión de equipo" },
];

const initiatives: { id: string; title: string; kind: InitiativeKind }[] = [
  { id: "p1", title: "Crecimiento JCI", kind: "Program" },
];

function summaryOf(rows: Participation[]) {
  return summarizeParticipations(rows, activities, initiatives);
}

function renderLedger(rows: Participation[]) {
  render(<ParticipationLedger summary={summaryOf(rows)} totalPoints={0} termId="2026" />);
}

describe("ParticipationLedger", () => {
  it("renders the activity title, parent initiative, role, points, state and month", () => {
    renderLedger([row({})]);
    expect(screen.getByText("Lanzamiento del programa")).toBeInTheDocument();
    // Appears twice: the project chip in the summary and the table's Iniciativa cell.
    expect(screen.getAllByText("Crecimiento JCI").length).toBeGreaterThan(0);
    expect(screen.getByText("Dirección de programa")).toBeInTheDocument();
    expect(screen.getByText("Director")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("Confirmado")).toBeInTheDocument();
    expect(screen.getByText("2026-06")).toBeInTheDocument();
  });

  it("summarizes participated projects and distinct activity count", () => {
    renderLedger([
      row({ id: "r1", activityId: "a1", parentId: "p1" }),
      row({ id: "r2", activityId: "a2", parentId: "p1" }),
    ]);
    expect(screen.getByText("Proyectos y actividades")).toBeInTheDocument();
    expect(screen.getByText(/2 actividades/)).toBeInTheDocument();
  });

  it("falls back to the rule label when the activity is unavailable", () => {
    renderLedger([row({ activityId: "missing" })]);
    expect(screen.getByText("Dirección de programa")).toBeInTheDocument();
  });

  it("labels provisional and voided states", () => {
    renderLedger([
      row({
        id: "r2",
        activityId: "a2",
        parentId: null,
        parentType: null,
        state: "provisional",
        pointRuleCode: "AttendAssembly",
        role: "Attendee",
      }),
      row({
        id: "r3",
        activityId: "a3",
        parentId: null,
        parentType: null,
        state: "voided",
        pointRuleCode: "AttendTM",
        role: "Team",
      }),
    ]);
    expect(screen.getByText("Provisional")).toBeInTheDocument();
    expect(screen.getByText("Anulado")).toBeInTheDocument();
    expect(screen.getByText("Asistente")).toBeInTheDocument();
    expect(screen.getByText("Equipo")).toBeInTheDocument();
  });

  it("shows an empty state when there are no rows", () => {
    renderLedger([]);
    expect(screen.getByText(/sin participaciones/i)).toBeInTheDocument();
  });
});
