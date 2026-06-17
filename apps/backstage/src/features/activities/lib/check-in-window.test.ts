import { describe, it, expect } from "vitest";
import { Timestamp } from "firebase/firestore";
import { isCheckInOpen } from "./check-in-window";

// 2026-06-13 10:00 Bolivia (= 14:00Z). "now" on the same Bolivia day.
const now = new Date("2026-06-13T14:00:00Z");
const ts = (iso: string) => Timestamp.fromDate(new Date(iso));

function activity(over: Partial<{ startAt: Timestamp; status: string }> = {}) {
  return {
    startAt: ts("2026-06-13T20:00:00Z"),
    status: "Programada",
    ...over,
  } as Parameters<typeof isCheckInOpen>[0];
}

describe("isCheckInOpen", () => {
  it("opens on the activity's own Bolivia day", () => {
    expect(isCheckInOpen(activity(), null, now)).toBe(true);
  });

  it("stays open late in the Bolivia evening even though UTC has rolled over", () => {
    // 2026-06-13 22:00 Bolivia = 2026-06-14T02:00Z; same Bolivia day as `now`.
    const evening = new Date("2026-06-14T02:00:00Z");
    expect(isCheckInOpen(activity(), null, evening)).toBe(true);
  });

  it("closes once the activity's day has passed", () => {
    const tomorrow = new Date("2026-06-14T14:00:00Z");
    expect(isCheckInOpen(activity(), null, tomorrow)).toBe(false);
  });

  it("closes for a cancelled activity", () => {
    expect(isCheckInOpen(activity({ status: "Cancelada" }), null, now)).toBe(false);
  });

  it("closes when the parent initiative is Finalizado", () => {
    expect(isCheckInOpen(activity(), "Finalizado", now)).toBe(false);
    expect(isCheckInOpen(activity(), "EnEjecucion", now)).toBe(true);
  });

  it("fails closed while a parented activity's status is unresolved", () => {
    expect(isCheckInOpen(activity(), undefined, now)).toBe(false);
  });

  it("keeps an admin blocked while the parent status is unresolved (gate fails closed)", () => {
    expect(isCheckInOpen(activity(), undefined, now, true)).toBe(false);
  });

  it("lets an admin bypass the day window for a backdated correction", () => {
    const tomorrow = new Date("2026-06-14T14:00:00Z");
    expect(isCheckInOpen(activity(), null, tomorrow, true)).toBe(true);
  });

  it("keeps an admin blocked on a cancelled activity (hatch is day-window only)", () => {
    expect(isCheckInOpen(activity({ status: "Cancelada" }), null, now, true)).toBe(false);
  });

  it("keeps an admin blocked when the parent is Finalizado (hatch is day-window only)", () => {
    const tomorrow = new Date("2026-06-14T14:00:00Z");
    expect(isCheckInOpen(activity(), "Finalizado", tomorrow, true)).toBe(false);
  });
});
