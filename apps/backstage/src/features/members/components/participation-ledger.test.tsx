import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Timestamp } from "firebase/firestore";
import type { Participation } from "@luminova/types/engine";
import { ParticipationLedger } from "./participation-ledger";

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

describe("ParticipationLedger", () => {
  it("renders the rule label, role, points, state badge and month", () => {
    render(<ParticipationLedger rows={[row({})]} />);
    expect(screen.getByText("Dirección de programa")).toBeInTheDocument();
    expect(screen.getByText("Director")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("Confirmado")).toBeInTheDocument();
    expect(screen.getByText("2026-06")).toBeInTheDocument();
  });

  it("labels provisional and voided states", () => {
    render(
      <ParticipationLedger
        rows={[
          row({
            id: "r2",
            state: "provisional",
            pointRuleCode: "AttendAssembly",
            role: "Attendee",
          }),
          row({ id: "r3", state: "voided", pointRuleCode: "AttendTM", role: "Team" }),
        ]}
      />,
    );
    expect(screen.getByText("Provisional")).toBeInTheDocument();
    expect(screen.getByText("Anulado")).toBeInTheDocument();
    expect(screen.getByText("Asistente")).toBeInTheDocument();
    expect(screen.getByText("Equipo")).toBeInTheDocument();
  });

  it("shows an empty state when there are no rows", () => {
    render(<ParticipationLedger rows={[]} />);
    expect(screen.getByText(/sin participaciones/i)).toBeInTheDocument();
  });
});
