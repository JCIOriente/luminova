import { describe, expect, it } from "vitest";
import { ACTIVITY_STATUS_TONE } from "./status-tone";

describe("ACTIVITY_STATUS_TONE", () => {
  it("maps every activity status to a tone (Cancelada red, Ejecutada green, Programada blue)", () => {
    expect(ACTIVITY_STATUS_TONE.Programada).toBe("blue");
    expect(ACTIVITY_STATUS_TONE.Ejecutada).toBe("green");
    expect(ACTIVITY_STATUS_TONE.Cancelada).toBe("red");
  });
});
