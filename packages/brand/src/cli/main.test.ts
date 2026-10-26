import { afterEach, describe, expect, it, vi } from "vitest";
import { BrandConfigError } from "../load-profile.ts";
import { CommandError } from "./gcloud.ts";
import { checkFlags, exitOnFailure, withProfile } from "./main.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

function capture() {
  const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
  const printed: string[] = [];
  vi.spyOn(console, "error").mockImplementation((line: unknown) => printed.push(String(line)));
  return { exit, printed };
}

describe("exitOnFailure", () => {
  it("prints a command failure's remedies and exits 1", async () => {
    const { exit, printed } = capture();
    await exitOnFailure(() => {
      throw new CommandError("gcloud auth list failed: no account", [
        { run: "gcloud auth login", where: "shell" },
      ]);
    });
    expect(printed.join("\n")).toBe(
      [
        "gcloud auth list failed: no account",
        "To fix:",
        "  - gcloud auth login   # in your shell",
      ].join("\n"),
    );
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("prints a profile error once, its To fix block included in the message", async () => {
    const { printed } = capture();
    await exitOnFailure(() => {
      throw new BrandConfigError(["x is wrong"], [{ run: "pnpm brand:check" }]);
    });
    expect(printed).toHaveLength(1);
    expect(printed[0]).toMatch(/x is wrong\nTo fix:\n {2}- pnpm brand:check/);
  });

  it("rethrows anything else: a bug keeps its stack", async () => {
    capture();
    await expect(
      exitOnFailure(() => {
        throw new TypeError("bug");
      }),
    ).rejects.toThrow(TypeError);
  });
});

describe("checkFlags", () => {
  const refusal = (run: () => void): BrandConfigError => {
    try {
      run();
    } catch (error) {
      if (error instanceof BrandConfigError) return error;
      throw error;
    }
    throw new Error("expected a BrandConfigError");
  };

  it("passes what the command takes, --profile included", () => {
    const flags = withProfile({ switches: ["--force"] });
    expect(() => checkFlags("brand:icons", flags, ["--force", "--profile", "acme"])).not.toThrow();
  });

  it("refuses a typo, listing every flag the command takes", () => {
    const error = refusal(() =>
      checkFlags("brand:icons", withProfile({ switches: ["--force"] }), ["--forse"]),
    );
    expect(error.errors).toEqual(["unknown option --forse"]);
    expect(error.remedies).toEqual([
      { change: "use only what brand:icons takes: --force, --profile <slug>" },
    ]);
  });

  it("says when a command takes no options", () => {
    const error = refusal(() => checkFlags("brand:guard", {}, ["--profile", "acme"]));
    expect(error.remedies).toEqual([{ change: "brand:guard takes no options" }]);
  });
});
