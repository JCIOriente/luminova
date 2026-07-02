import { describe, expect, it } from "vitest";
import { initials } from "./initials";

describe("initials", () => {
  it("takes the first letter of up to two name parts, uppercased", () => {
    expect(initials("Ana")).toBe("A");
    expect(initials("Ana López")).toBe("AL");
    expect(initials("ana maría lópez")).toBe("AM");
  });

  it("falls back to ? for a blank value", () => {
    expect(initials("")).toBe("?");
    expect(initials("   ")).toBe("?");
  });
});
