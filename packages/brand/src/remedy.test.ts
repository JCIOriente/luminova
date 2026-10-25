import { describe, expect, it } from "vitest";
import { formatNext, formatRemedies, uniqueRemedies } from "./remedy.ts";

describe("formatRemedies", () => {
  it("prints each remedy once, with the command and where to run it", () => {
    const text = formatRemedies([
      { change: "add the missing files to brand-assets/", run: "pnpm brand:check" },
      { change: "add the missing files to brand-assets/", run: "pnpm brand:check" },
      { run: "gcloud auth login", where: "shell" },
    ]);
    expect(text).toBe(
      [
        "To fix:",
        "  - add the missing files to brand-assets/",
        "      pnpm brand:check   # in the repo",
        "  - gcloud auth login   # in your shell",
      ].join("\n"),
    );
  });

  it("names a console as the place, without a command", () => {
    expect(
      formatRemedies([
        { change: "copy the web app id", where: "Firebase console → Project settings" },
      ]),
    ).toBe(
      ["To fix:", "  - copy the web app id   # in the Firebase console → Project settings"].join(
        "\n",
      ),
    );
  });

  it("prints nothing when there is nothing to fix", () => {
    expect(formatRemedies([undefined, undefined])).toBe("");
  });
});

describe("formatNext", () => {
  it("prints the next step as a command to paste", () => {
    expect(formatNext({ change: "check the whole setup", run: "pnpm brand:doctor" })).toBe(
      ["Next: check the whole setup", "  pnpm brand:doctor   # in the repo"].join("\n"),
    );
  });
});

describe("uniqueRemedies", () => {
  it("keeps the first of equal remedies, in order", () => {
    const a = { run: "a" };
    expect(uniqueRemedies([a, undefined, { run: "b" }, { run: "a" }])).toEqual([a, { run: "b" }]);
  });
});
