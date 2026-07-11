import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase/firestore";
import type { Activity } from "@luminova/types";
import { filterActivities, upcomingActivities } from "./activity-filter";

function activity(id: string, iso: string, status: Activity["status"] = "Programada"): Activity {
  return {
    id,
    termId: "2026",
    title: id,
    description: null,
    location: null,
    category: "Assembly",
    parentType: null,
    parentId: null,
    organizers: { directorId: null, coDirectorIds: [] },
    startAt: Timestamp.fromDate(new Date(iso)),
    endAt: null,
    photos: [],
    status,
  };
}

const now = new Date("2026-06-15T12:00:00Z");
const rows = [
  activity("past", "2026-06-01T10:00:00Z"),
  activity("future", "2026-06-28T10:00:00Z"),
  activity("futureCancelled", "2026-06-29T10:00:00Z", "Cancelada"),
  activity("nextMonth", "2026-07-02T10:00:00Z"),
];

describe("filterActivities", () => {
  it("todas returns everything", () => {
    expect(filterActivities(rows, "todas", now)).toHaveLength(4);
  });

  it("proximos keeps non-cancelled activities from now onward", () => {
    const ids = filterActivities(rows, "proximos", now).map((a) => a.id);
    expect(ids).toEqual(["future", "nextMonth"]);
  });

  it("proximos keeps today's later events using the Bolivia wall-clock, not the raw instant", () => {
    // 18:00 Bolivia (22:00Z); an event scheduled 20:00 Bolivia (20:00Z) is still upcoming.
    const evening = new Date("2026-06-15T22:00:00Z");
    const today8pm = activity("today8pm", "2026-06-15T20:00:00Z");
    const ids = filterActivities([today8pm], "proximos", evening).map((a) => a.id);
    expect(ids).toEqual(["today8pm"]);
  });

  it("mes keeps the current UTC calendar month only", () => {
    const ids = filterActivities(rows, "mes", now).map((a) => a.id);
    expect(ids.sort()).toEqual(["future", "futureCancelled", "past"]);
  });
});

describe("upcomingActivities", () => {
  it("returns upcoming activities soonest-first", () => {
    expect(upcomingActivities(rows, now).map((a) => a.id)).toEqual(["future", "nextMonth"]);
  });

  it("caps at the limit when given", () => {
    expect(upcomingActivities(rows, now, 1).map((a) => a.id)).toEqual(["future"]);
  });
});
