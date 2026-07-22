import { describe, it, expect, vi, beforeEach } from "vitest";
import { readStorage, writeStorage, removeStorage } from "./safe-storage";

beforeEach(() => {
  localStorage.clear();
});

describe("safe-storage", () => {
  it("round-trips a value through localStorage", () => {
    writeStorage("k", "v");
    expect(readStorage("k")).toBe("v");
    removeStorage("k");
    expect(readStorage("k")).toBeNull();
  });

  it("returns null on a getItem throw instead of propagating", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readStorage("k")).toBeNull();
    spy.mockRestore();
  });

  it("swallows a setItem throw instead of propagating", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(() => writeStorage("k", "v")).not.toThrow();
    spy.mockRestore();
  });

  it("swallows a removeItem throw instead of propagating", () => {
    const spy = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => removeStorage("k")).not.toThrow();
    spy.mockRestore();
  });
});
