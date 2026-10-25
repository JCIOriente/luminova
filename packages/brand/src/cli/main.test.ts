import { afterEach, describe, expect, it, vi } from "vitest";
import { BrandConfigError } from "../load-profile.ts";
import { CommandError } from "./gcloud.ts";
import { exitOnFailure } from "./main.ts";

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
