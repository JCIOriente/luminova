import { describe, it, expect } from "vitest";
import { Timestamp } from "firebase/firestore";
import { toActivityCreateDoc } from "./activity-mapper";
import type { ActivityInput } from "@luminova/types";

const input: ActivityInput = {
  category: "Assembly",
  parentType: null,
  parentId: null,
  startAt: "2026-06-10T18:30",
  directorId: null,
  coDirectorId: null,
};

describe("toActivityCreateDoc", () => {
  it("sets term, status, organizers and a Timestamp startAt", () => {
    const doc = toActivityCreateDoc(input, "2026");
    expect(doc.termId).toBe("2026");
    expect(doc.status).toBe("Programada");
    expect(doc.organizers).toEqual({ directorId: null, coDirectorId: null });
    expect(doc.startAt).toBeInstanceOf(Timestamp);
    expect(doc.parentType).toBeNull();
    expect(doc.parentId).toBeNull();
  });

  it("round-trips startAt as the exact local datetime (UTC-stable)", () => {
    const doc = toActivityCreateDoc(input, "2026");
    expect(doc.startAt.toDate().toISOString()).toBe("2026-06-10T18:30:00.000Z");
  });

  it("carries a director and parent through for a ProjectExecution", () => {
    const doc = toActivityCreateDoc(
      {
        category: "ProjectExecution",
        parentType: "Project",
        parentId: "p-1",
        startAt: "2026-06-10T18:30",
        directorId: "m-1",
        coDirectorId: null,
      },
      "2026",
    );
    expect(doc.organizers.directorId).toBe("m-1");
    expect(doc.parentType).toBe("Project");
    expect(doc.parentId).toBe("p-1");
  });
});
