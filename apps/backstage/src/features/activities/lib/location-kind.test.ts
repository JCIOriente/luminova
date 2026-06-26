import { describe, expect, it } from "vitest";
import { locationKind } from "./location-kind";

describe("locationKind", () => {
  it("treats URLs and meeting links as virtual", () => {
    expect(locationKind("https://meet.google.com/abc")).toBe("virtual");
    expect(locationKind("zoom.us/j/123")).toBe("virtual");
    expect(locationKind("www.example.com/sala")).toBe("virtual");
  });

  it("treats plain addresses as physical", () => {
    expect(locationKind("Sede JCI · Equipetrol")).toBe("physical");
    expect(locationKind("Hotel Los Tajibos")).toBe("physical");
  });
});
