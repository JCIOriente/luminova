import { describe, expect, it } from "vitest";
import { commandFailure } from "./gcloud.ts";
import { installRemedy } from "./install.ts";

describe("commandFailure", () => {
  it("says how to install a CLI that is not on PATH", () => {
    const error = commandFailure("gh", ["api", "user"], { code: "ENOENT", stderr: "" });
    expect(error.kind).toBe("notInstalled");
    expect(error.message).toMatch(/gh is not installed/);
    expect(error.remedies).toEqual([installRemedy("gh")]);
  });

  it("reads macOS's java stub as Java not installed", () => {
    const error = commandFailure("java", ["--version"], {
      code: 1,
      stderr:
        "The operation couldn’t be completed. Unable to locate a Java Runtime.\nPlease visit http://www.java.com for information on installing Java.\n",
    });
    expect(error.kind).toBe("notInstalled");
    expect(error.remedies).toEqual([installRemedy("java")]);
  });

  it.each([
    [
      "gcloud",
      "ERROR: (gcloud) You do not currently have an active account selected.",
      "gcloud auth login",
    ],
    ["gh", "To get started with GitHub CLI, please run:  gh auth login", "gh auth login"],
    ["firebase", "Error: Failed to authenticate, have you run firebase login?", "firebase login"],
  ] as const)("asks %s to sign in when stderr says so", (command, stderr, run) => {
    const error = commandFailure(command, [], { stderr });
    expect(error.kind).toBe("signIn");
    expect(error.remedies).toEqual([{ run, where: "shell" }]);
  });

  it("asks for an account with access on a gcloud 403", () => {
    const error = commandFailure("gcloud", ["storage", "objects", "list"], {
      stderr: "ERROR: HTTPError 403: owner@example.org does not have storage.objects.list access",
    });
    expect(error.kind).toBe("denied");
    expect(error.remedies[0]).toMatchObject({ run: "gcloud auth login" });
  });

  it("classifies a gcloud 404 without guessing a remedy", () => {
    const error = commandFailure("gcloud", ["storage", "objects", "list"], {
      stderr: "ERROR: gs://x not found: 404.",
    });
    expect(error).toMatchObject({ kind: "notFound", remedies: [] });
  });

  it("leaves an unrecognised failure plain", () => {
    expect(commandFailure("pnpm", ["--version"], { stderr: "boom" })).toMatchObject({
      kind: "other",
      remedies: [],
      message: "pnpm --version failed: boom",
    });
  });
});
