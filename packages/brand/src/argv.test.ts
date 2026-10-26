import { describe, expect, it } from "vitest";
import { flagUsage, flagValue, unexpectedArguments } from "./argv.ts";

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

describe("unexpectedArguments", () => {
  const flags = { switches: ["--force"], values: { "--profile": "slug" } };

  it.each([
    [[]],
    [["--force"]],
    [["--profile", "acme", "--force"]],
    [["--profile=acme"]],
    [["--", "--force"]],
  ])("accepts what the command takes: %j", (argv) => {
    expect(unexpectedArguments(argv, flags)).toEqual([]);
  });

  it.each([
    [["--forse"], "unknown option --forse"],
    [["-f"], "unknown option -f"],
    [["--relase=1"], "unknown option --relase"],
    [["--force=yes"], "--force takes no value"],
    [["force"], 'unexpected argument "force"'],
    [["--profile", "acme", "extra"], 'unexpected argument "extra"'],
  ])("refuses %j", (argv, message) => {
    expect(unexpectedArguments(argv, flags)).toEqual([message]);
  });

  it("leaves a value flag without its value to flagValue", () => {
    expect(unexpectedArguments(["--profile", "--force"], flags)).toEqual([]);
  });

  it("reports every problem, in order", () => {
    expect(unexpectedArguments(["--a", "b"], {})).toEqual([
      "unknown option --a",
      'unexpected argument "b"',
    ]);
  });
});

describe("flagUsage", () => {
  it("lists switches, then value flags with their value", () => {
    expect(flagUsage({ switches: ["--release"], values: { "--assets": "folder" } })).toBe(
      "--release, --assets <folder>",
    );
    expect(flagUsage({})).toBe("");
  });
});
