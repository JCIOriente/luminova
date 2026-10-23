import { describe, expect, it } from "vitest";
import {
  ProjectTargetError,
  agreedProject,
  envProjectSources,
  parseProjectFlag,
} from "./project-target.ts";

describe("envProjectSources", () => {
  it("reads both names Google tooling exports by default, skipping blanks", () => {
    expect(envProjectSources({ GCLOUD_PROJECT: "a", GOOGLE_CLOUD_PROJECT: " " })).toEqual([
      ["GCLOUD_PROJECT", "a"],
    ]);
  });

  it("reads only the keys a caller names", () => {
    expect(
      envProjectSources({ GOOGLE_CLOUD_PROJECT: "b", GCP_PROJECT_ID: "a" }, [
        "GCLOUD_PROJECT",
        "GCP_PROJECT_ID",
      ]),
    ).toEqual([["GCP_PROJECT_ID", "a"]]);
  });
});

describe("agreedProject", () => {
  it("is undefined when no source is set", () => {
    expect(agreedProject([])).toBeUndefined();
  });

  it("returns the project every source names", () => {
    expect(
      agreedProject([
        ["--project", "acme"],
        ["GOOGLE_CLOUD_PROJECT", "acme"],
      ]),
    ).toBe("acme");
  });

  it("refuses sources that disagree, whichever order they come in", () => {
    for (const sources of [
      [
        ["GCLOUD_PROJECT", "a"],
        ["GOOGLE_CLOUD_PROJECT", "b"],
      ],
      [
        ["GOOGLE_CLOUD_PROJECT", "b"],
        ["GCLOUD_PROJECT", "a"],
      ],
    ] as const) {
      expect(() => agreedProject(sources)).toThrow(ProjectTargetError);
      expect(() => agreedProject(sources)).toThrow(/disagree.*GCLOUD_PROJECT=a/);
    }
  });
});

describe("parseProjectFlag", () => {
  it("reads --project <id> and --project=<id>", () => {
    expect(parseProjectFlag(["--project", "a"])).toBe("a");
    expect(parseProjectFlag(["--project=b"])).toBe("b");
    expect(parseProjectFlag([])).toBeUndefined();
  });

  it("refuses a flag without an id", () => {
    expect(() => parseProjectFlag(["--project"])).toThrow(ProjectTargetError);
    expect(() => parseProjectFlag(["--project", "--other"])).toThrow(ProjectTargetError);
  });
});
