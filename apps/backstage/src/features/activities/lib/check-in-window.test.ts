import { describe, it, expect } from "vitest";
import { Timestamp } from "firebase/firestore";
import { isCheckInOpen } from "./check-in-window";

// 2026-06-13 10:00 Bolivia (= 14:00Z). "now" on the same Bolivia day.
const now = new Date("2026-06-13T14:00:00Z");
const ts = (iso: string) => Timestamp.fromDate(new Date(iso));

function activity(
  over: Partial<{ startAt: Timestamp; status: string; parentId: string | null }> = {},
) {
  return {
    startAt: ts("2026-06-13T20:00:00Z"),
    status: "Programada",
    parentId: null,
    ...over,
  } as Parameters<typeof isCheckInOpen>[0];
}

describe("isCheckInOpen", () => {
  it("opens on the activity's own Bolivia day", () => {
    expect(isCheckInOpen(activity(), {}, now)).toBe(true);
  });

  it("stays open late in the Bolivia evening even though UTC has rolled over", () => {
    // 2026-06-13 22:00 Bolivia = 2026-06-14T02:00Z; same Bolivia day as `now`.
    const evening = new Date("2026-06-14T02:00:00Z");
    expect(isCheckInOpen(activity(), {}, evening)).toBe(true);
  });

  it("closes once the activity's day has passed", () => {
    const tomorrow = new Date("2026-06-14T14:00:00Z");
    expect(isCheckInOpen(activity(), {}, tomorrow)).toBe(false);
  });

  it("closes for a cancelled activity", () => {
    expect(isCheckInOpen(activity({ status: "Cancelada" }), {}, now)).toBe(false);
  });

  it("closes when the parent initiative is Finalizado", () => {
    const a = activity({ parentId: "p1" });
    expect(isCheckInOpen(a, { p1: "Finalizado" }, now)).toBe(false);
    expect(isCheckInOpen(a, { p1: "EnEjecucion" }, now)).toBe(true);
  });
});
