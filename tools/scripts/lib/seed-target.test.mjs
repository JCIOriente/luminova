import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ProjectTargetError,
  parseProjectFlag,
  resolveLocalProject,
  resolveProductionTarget,
  seededSiteContent,
} from "./seed-target.mjs";

const profile = { slug: "acme", brand: { firebase: { projectId: "acme-prod" } } };

test("local scripts default to the profile's project", () => {
  assert.equal(resolveLocalProject({ env: {}, profile }), "acme-prod");
});

test("local scripts do not load a profile when the env names the project", () => {
  const broken = { BRAND_PROFILE: "no-such-profile", GCLOUD_PROJECT: "demo-x" };
  assert.equal(resolveLocalProject({ env: broken }), "demo-x");
});

test("local scripts honour GCLOUD_PROJECT over the profile", () => {
  assert.equal(resolveLocalProject({ env: { GCLOUD_PROJECT: "demo-x" }, profile }), "demo-x");
});

test("local scripts honour either project env name", () => {
  assert.equal(resolveLocalProject({ env: { GOOGLE_CLOUD_PROJECT: "other" }, profile }), "other");
});

test("local scripts refuse project env names that disagree", () => {
  assert.throws(
    () =>
      resolveLocalProject({
        env: { GCLOUD_PROJECT: "demo-x", GOOGLE_CLOUD_PROJECT: "other" },
        profile,
      }),
    (error) => error instanceof ProjectTargetError && /disagree/.test(error.message),
  );
});

test("parseProjectFlag reads --project <id> and --project=<id>", () => {
  assert.equal(parseProjectFlag(["--project", "a"]), "a");
  assert.equal(parseProjectFlag(["--project=b"]), "b");
  assert.equal(parseProjectFlag([]), undefined);
  assert.throws(() => parseProjectFlag(["--project"]), ProjectTargetError);
});

test("production refuses without an explicit project", () => {
  assert.throws(
    () => resolveProductionTarget({ argv: [], env: {}, profile }),
    (error) =>
      error instanceof ProjectTargetError && /--project <id> or GCLOUD_PROJECT/.test(error.message),
  );
});

test("production refuses a project that is not the profile's", () => {
  assert.throws(
    () => resolveProductionTarget({ argv: [], env: { GCLOUD_PROJECT: "someone-else" }, profile }),
    (error) =>
      error instanceof ProjectTargetError &&
      error.message.includes('"someone-else"') &&
      error.message.includes('"acme" (acme-prod)'),
  );
});

test("production refuses when the project sources disagree", () => {
  assert.throws(
    () =>
      resolveProductionTarget({
        argv: ["--project", "acme-prod"],
        env: { GOOGLE_CLOUD_PROJECT: "someone-else" },
        profile,
      }),
    (error) => error instanceof ProjectTargetError && /disagree/.test(error.message),
  );
});

test("production accepts the profile's project from the flag or the env", () => {
  assert.equal(
    resolveProductionTarget({ argv: ["--project", "acme-prod"], env: {}, profile }),
    "acme-prod",
  );
  assert.equal(
    resolveProductionTarget({ argv: [], env: { GCLOUD_PROJECT: "acme-prod" }, profile }),
    "acme-prod",
  );
});

test("seededSiteContent reads the profile's seed-owned keys", () => {
  const content = seededSiteContent({
    slug: "fixture",
    dir: new URL("../../../brand/fixture", import.meta.url).pathname,
  });
  assert.deepEqual(Object.keys(content).sort(), ["contact", "mvv", "reasons", "stats", "timeline"]);
  assert.equal(content.stats.standoutOrg.title, "Fixture Standout Award");
});
