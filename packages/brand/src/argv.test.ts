import { describe, expect, it } from "vitest";
import { flagValue } from "./argv.ts";

const fail = (message: string) => new Error(message);

describe("flagValue", () => {
  it("reads both the spaced and the = form", () => {
    expect(flagValue(["--profile", "acme"], "--profile", fail)).toBe("acme");
    expect(flagValue(["--profile=acme"], "--profile", fail)).toBe("acme");
    expect(flagValue(["--release"], "--profile", fail)).toBeUndefined();
  });

  it.each([[["--profile"]], [["--profile", "--release"]], [["--profile="]]])(
    "refuses a flag without a value: %j",
    (argv) => {
      expect(() => flagValue(argv, "--profile", fail)).toThrow("--profile needs a value.");
    },
  );
});
