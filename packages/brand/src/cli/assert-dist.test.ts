import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RELEASE_MARKER_FILE } from "../release.ts";
import { assertDist } from "./assert-dist.ts";

let distDir: string;

const INDEX_HTML = "<!doctype html><script src=/assets/index-abc.js></script>";
const MARKER = {
  profile: "jci-oriente",
  projectId: "jci-oriente",
  assets: "a".repeat(64),
  indexHtml: createHash("sha256").update(INDEX_HTML).digest("hex"),
};

function writeMarker(marker: object = MARKER) {
  writeFileSync(join(distDir, "index.html"), INDEX_HTML);
  writeFileSync(join(distDir, RELEASE_MARKER_FILE), JSON.stringify(marker));
}

beforeEach(() => {
  distDir = mkdtempSync(join(tmpdir(), "brand-dist-"));
});

afterEach(() => {
  rmSync(distDir, { recursive: true, force: true });
});

describe("assertDist", () => {
  it("accepts a release dist built for the project firebase-tools targets", () => {
    writeMarker();
    expect(
      assertDist({ distDir, label: "apps/spotlight/dist", env: { GCLOUD_PROJECT: "jci-oriente" } }),
    ).toEqual({ errors: [], marker: MARKER });
  });

  it("accepts CD's own check through GCP_PROJECT_ID", () => {
    writeMarker();
    expect(
      assertDist({ distDir, label: "d", env: { GCP_PROJECT_ID: "jci-oriente" } }).errors,
    ).toEqual([]);
  });

  it("rejects a dist with no marker (a plain `pnpm build`)", () => {
    expect(
      assertDist({ distDir, label: "apps/spotlight/dist", env: { GCLOUD_PROJECT: "jci-oriente" } })
        .errors,
    ).toEqual([expect.stringMatching(/^apps\/spotlight\/dist has no release marker/)]);
  });

  it("rejects a dist built for another project", () => {
    writeMarker({ ...MARKER, profile: "acme", projectId: "acme-prod" });
    expect(
      assertDist({ distDir, label: "d", env: { GCLOUD_PROJECT: "jci-oriente" } }).errors,
    ).toEqual([
      expect.stringMatching(
        /built for "acme-prod" \(profile "acme"\) but this deploy targets "jci-oriente"/,
      ),
    ]);
  });

  it("rejects a malformed marker", () => {
    writeMarker({ profile: "jci-oriente" });
    expect(
      assertDist({ distDir, label: "d", env: { GCLOUD_PROJECT: "jci-oriente" } }).errors,
    ).toContainEqual(expect.stringMatching(/projectId/));
  });

  it("refuses when it cannot tell the target project", () => {
    writeMarker();
    expect(assertDist({ distDir, label: "d", env: {} }).errors).toEqual([
      expect.stringMatching(/cannot tell which project/),
    ]);
  });

  it("rejects a stale marker left beside a different build (a turbo cache replay)", () => {
    writeMarker();
    writeFileSync(join(distDir, "index.html"), "<!doctype html><script src=/assets/index-zzz.js>");
    expect(
      assertDist({ distDir, label: "d", env: { GCLOUD_PROJECT: "jci-oriente" } }).errors,
    ).toEqual([expect.stringMatching(/index\.html is not the one this marker was written for/)]);
  });

  it("ignores a shell GOOGLE_CLOUD_PROJECT: firebase-tools' GCLOUD_PROJECT names the target", () => {
    writeMarker();
    expect(
      assertDist({
        distDir,
        label: "d",
        env: { GCLOUD_PROJECT: "jci-oriente", GOOGLE_CLOUD_PROJECT: "personal-sandbox" },
      }).errors,
    ).toEqual([]);
  });

  it("refuses project sources that disagree", () => {
    writeMarker();
    expect(
      assertDist({
        distDir,
        label: "d",
        env: { GCLOUD_PROJECT: "jci-oriente", GCP_PROJECT_ID: "someone-else" },
      }).errors,
    ).toEqual([expect.stringMatching(/disagree/)]);
  });
});
