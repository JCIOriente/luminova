import { describe, expect, it } from "vitest";
import { STANDALONE_CATEGORIES } from "./categories";

describe("STANDALONE_CATEGORIES", () => {
  it("excludes ProjectExecution (created only inside a parent initiative)", () => {
    expect(STANDALONE_CATEGORIES).not.toContain("ProjectExecution");
    expect(STANDALONE_CATEGORIES).toContain("Assembly");
    expect(STANDALONE_CATEGORIES).toContain("Course");
    expect(STANDALONE_CATEGORIES).toContain("TM");
    expect(STANDALONE_CATEGORIES).toContain("Anniversary");
    expect(STANDALONE_CATEGORIES).toContain("NationalEvent");
  });
});
