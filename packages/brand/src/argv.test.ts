import { describe, expect, it } from "vitest";
import { flagValue, parseArgs } from "./argv.ts";

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

describe("parseArgs", () => {
  const flags = { switches: ["--force"], values: { "--profile": "slug" } };
  const refuse = (problems: string[], usage: string) =>
    new Error(`${problems.join("; ")} | ${usage}`);
  const parse = (argv: string[]) => parseArgs(argv, flags, refuse);

  it.each([
    [[], false, undefined],
    [["--force"], true, undefined],
    [["--profile", "acme", "--force"], true, "acme"],
    [["--profile=acme"], false, "acme"],
    [["--", "--force"], true, undefined],
  ])("reads what the command takes: %j", (argv, force, profile) => {
    const args = parse(argv);
    expect(args.has("--force")).toBe(force);
    expect(args.value("--profile")).toBe(profile);
  });

  it.each([
    [["--forse"], "unknown option --forse"],
    [["-f"], "unknown option -f"],
    [["--relase=1"], "unknown option --relase"],
    [["--force=yes"], "--force takes no value"],
    [["force"], 'unexpected argument "force"'],
    [["--profile", "acme", "extra"], 'unexpected argument "extra"'],
    [["--a", "b"], 'unknown option --a; unexpected argument "b"'],
  ])("refuses %j, listing the flags it takes", (argv, problems) => {
    expect(() => parse(argv)).toThrow(`${problems} | --force, --profile <slug>`);
  });

  it("refuses a value flag without its value when it is read", () => {
    const args = parse(["--profile", "--force"]);
    expect(() => args.value("--profile")).toThrow("--profile needs a value.");
  });

  it("throws on reading a flag that was not declared", () => {
    const args = parse([]);
    expect(() => args.has("--release")).toThrow("--release is read but not declared");
    expect(() => args.value("--force")).toThrow("--force is read but not declared");
  });
});
