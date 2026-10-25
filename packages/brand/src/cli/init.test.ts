import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ASSET_CONTRACT } from "../assets.ts";
import { BrandConfigError, REPO_ROOT, loadProfile } from "../load-profile.ts";
import { PULLED_ASSETS_DIR } from "../release.ts";
import { CommandError, type CommandRunner } from "./gcloud.ts";
import { init, initNext } from "./init.ts";
import type { Prompter } from "./prompts.ts";

const SPOTLIGHT_APP = "1:111222333:web:aaa";
const BACKSTAGE_APP = "1:111222333:web:bbb";

function minimalAnswers(): Record<string, unknown> {
  return {
    slug: "jci-valle",
    name: "JCI Valle",
    locality: { city: "Cochabamba", region: "el valle", country: "Bolivia" },
    foundedYear: 1990,
    stats: { nationalOrganizations: 18 },
    parentOrganization: { name: "JCI Bolivia", url: "https://jcibolivia.org/" },
    broadcastChannelName: "Difusión Valle",
    urls: { spotlight: "https://jcivalle.org", backstage: "https://admin.jcivalle.org" },
    backstage: { emailPlaceholder: "tu@jcivalle.org", contactEmail: "hola@jcivalle.org" },
    firebase: {
      projectId: "jci-valle",
      web: {
        spotlight: { appId: SPOTLIGHT_APP, apiKey: "key-spotlight" },
        backstage: { appId: BACKSTAGE_APP, apiKey: "key-backstage" },
      },
    },
  };
}

let root: string;
let calls: string[][];
const noCommands: CommandRunner = async (command, args) => {
  calls.push([command, ...args]);
  throw new Error("no command expected");
};

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "brand-init-"));
  cpSync(join(REPO_ROOT, "brand"), join(root, "brand"), { recursive: true });
  calls = [];
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("init from an answers file", () => {
  it("writes a profile the loader accepts, with the derivable values filled in", async () => {
    const result = await init({ repoRoot: root, answers: minimalAnswers(), run: noCommands });
    expect(result.slug).toBe("jci-valle");

    const profile = loadProfile({ repoRoot: root, profile: "jci-valle" });
    const { brand } = profile;
    expect(brand.firebase).toMatchObject({
      storageBucket: "jci-valle.firebasestorage.app",
      sites: { spotlight: "jci-valle", backstage: "jci-valle-backstage" },
      web: {
        authDomain: "jci-valle.firebaseapp.com",
        messagingSenderId: "111222333",
        spotlight: { appCheckSiteKey: "", vapidKey: "" },
      },
    });
    expect(brand.assetsBucket).toBe("jci-valle-brand-assets");
    expect(brand.qrPrefix).toBe("jcivalle");
    expect(brand.shortName).toBe("JCI Valle");
    expect(brand.seo.ogTitle).toBe("JCI Valle");
    expect(brand.locality.cityFormal).toBe("Cochabamba");
    expect(brand.locality.regionShort).toBe("el valle");
    expect(calls).toEqual([]);
  });

  it("takes style defaults from the example profile", async () => {
    await init({ repoRoot: root, answers: minimalAnswers(), run: noCommands });
    const example = loadProfile({ repoRoot: root, profile: "jci-oriente" }).brand;
    const { brand } = loadProfile({ repoRoot: root, profile: "jci-valle" });
    expect(brand.themeColor).toEqual(example.themeColor);
    expect(brand.locale).toBe(example.locale);
    expect(brand.movementName).toBe(example.movementName);
  });

  it("leaves an omitted regionShort out of the file", async () => {
    await init({ repoRoot: root, answers: minimalAnswers(), run: noCommands });
    const written = JSON.parse(readFileSync(join(root, "brand/jci-valle/brand.json"), "utf8"));
    expect(written.locality).not.toHaveProperty("regionShort");
    expect(Object.keys(written).slice(0, 2)).toEqual(["$schema", "slug"]);
  });

  it("copies the example site content and writes the asset README", async () => {
    await init({ repoRoot: root, answers: minimalAnswers(), run: noCommands });
    expect(readFileSync(join(root, "brand/jci-valle/site-content.json"), "utf8")).toBe(
      readFileSync(join(root, "brand/jci-oriente/site-content.json"), "utf8"),
    );
    const readme = readFileSync(join(root, PULLED_ASSETS_DIR, "README.txt"), "utf8");
    for (const { path } of ASSET_CONTRACT) expect(readme).toContain(path);
    expect(readme).toContain("1200×630");
    expect(readme).toMatch(/never commit/i);
  });

  it("selects the new profile in luminova.json, writes .firebaserc and CD's sign-in names", async () => {
    writeFileSync(join(root, "luminova.json"), JSON.stringify({ profile: "jci-oriente" }));
    const { files } = await init({ repoRoot: root, answers: minimalAnswers(), run: noCommands });
    expect(files).toEqual(expect.arrayContaining(["luminova.json", ".firebaserc"]));
    expect(loadProfile({ repoRoot: root, env: {} })).toMatchObject({
      slug: "jci-valle",
      source: "file",
    });
    expect(JSON.parse(readFileSync(join(root, ".firebaserc"), "utf8")).projects.default).toBe(
      "jci-valle",
    );
    expect(loadProfile({ repoRoot: root, profile: "jci-valle" }).brand.deploy).toEqual({
      workloadIdentityProvider:
        "projects/111222333/locations/global/workloadIdentityPools/github-actions/providers/github-oidc",
      serviceAccount: "firebase-deployer@jci-valle.iam.gserviceaccount.com",
    });
  });

  it("keeps an existing brand-assets/README.txt", async () => {
    mkdirSync(join(root, PULLED_ASSETS_DIR));
    writeFileSync(join(root, PULLED_ASSETS_DIR, "README.txt"), "mine");
    await init({ repoRoot: root, answers: minimalAnswers(), run: noCommands });
    expect(readFileSync(join(root, PULLED_ASSETS_DIR, "README.txt"), "utf8")).toBe("mine");
  });

  it("lists every missing required value at once and writes nothing", async () => {
    const answers = minimalAnswers();
    delete answers.name;
    delete answers.urls;
    const error = await init({ repoRoot: root, answers, run: noCommands }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BrandConfigError);
    const message = String(error);
    expect(message).toMatch(/name/);
    expect(message).toMatch(/urls/);
    expect(existsSync(join(root, "brand/jci-valle"))).toBe(false);
    expect(existsSync(join(root, PULLED_ASSETS_DIR))).toBe(false);
  });

  it("refuses to overwrite an existing profile", async () => {
    const answers = { ...minimalAnswers(), slug: "jci-oriente" };
    await expect(init({ repoRoot: root, answers, run: noCommands })).rejects.toThrow(
      /brand\/jci-oriente already exists/,
    );
  });

  it("refuses a malformed slug before writing", async () => {
    const answers = { ...minimalAnswers(), slug: "../escape" };
    await expect(init({ repoRoot: root, answers, run: noCommands })).rejects.toThrow(/kebab-case/);
    expect(existsSync(join(root, "escape"))).toBe(false);
  });
});

describe("init --sdkconfig", () => {
  const sdkconfig =
    (projectId: string): CommandRunner =>
    async (command, args) => {
      calls.push([command, ...args]);
      const appId = args[2];
      return JSON.stringify({
        status: "success",
        result: {
          fileName: "firebase-js-config.json",
          sdkConfig: {
            projectId,
            appId,
            apiKey: `key-for-${appId}`,
            authDomain: `${projectId}.firebaseapp.com`,
            messagingSenderId: "999",
            storageBucket: `${projectId}.firebasestorage.app`,
          },
        },
      });
    };

  function withoutKeys() {
    const answers = minimalAnswers();
    answers.firebase = {
      projectId: "jci-valle",
      web: { spotlight: { appId: SPOTLIGHT_APP }, backstage: { appId: BACKSTAGE_APP } },
    };
    return answers;
  }

  it("fills the web keys from firebase apps:sdkconfig, read-only", async () => {
    await init({
      repoRoot: root,
      answers: withoutKeys(),
      fillWeb: true,
      run: sdkconfig("jci-valle"),
    });
    expect(calls).toEqual([
      ["firebase", "apps:sdkconfig", "WEB", SPOTLIGHT_APP, "--project", "jci-valle", "--json"],
      ["firebase", "apps:sdkconfig", "WEB", BACKSTAGE_APP, "--project", "jci-valle", "--json"],
    ]);
    const { web } = loadProfile({ repoRoot: root, profile: "jci-valle" }).brand.firebase;
    expect(web.spotlight.apiKey).toBe(`key-for-${SPOTLIGHT_APP}`);
    expect(web.backstage.apiKey).toBe(`key-for-${BACKSTAGE_APP}`);
    expect(web.messagingSenderId).toBe("999");
  });

  it("refuses an app that belongs to another project", async () => {
    await expect(
      init({
        repoRoot: root,
        answers: withoutKeys(),
        fillWeb: true,
        run: sdkconfig("someone-else"),
      }),
    ).rejects.toThrow(/belongs to project "someone-else"/);
    expect(existsSync(join(root, "brand/jci-valle"))).toBe(false);
  });
});

describe("init interactively", () => {
  it("asks each question once, offering the derived default", async () => {
    const asked: { key: string; fallback: string | undefined }[] = [];
    const replies: Record<string, string> = {
      slug: "jci-valle",
      name: "JCI Valle",
      "locality.city": "Cochabamba",
      "locality.region": "el valle",
      "locality.country": "Bolivia",
      foundedYear: "1990",
      "stats.nationalOrganizations": "18",
      "parentOrganization.name": "JCI Bolivia",
      "parentOrganization.url": "https://jcibolivia.org/",
      broadcastChannelName: "Difusión Valle",
      "urls.spotlight": "https://jcivalle.org",
      "urls.backstage": "https://admin.jcivalle.org",
      "backstage.emailPlaceholder": "tu@jcivalle.org",
      "backstage.contactEmail": "hola@jcivalle.org",
      "firebase.projectId": "jci-valle",
      "firebase.web.spotlight.appId": SPOTLIGHT_APP,
      "firebase.web.backstage.appId": BACKSTAGE_APP,
      fillWeb: "n",
      "firebase.web.spotlight.apiKey": "key-spotlight",
      "firebase.web.backstage.apiKey": "key-backstage",
    };
    const prompter: Prompter = {
      async ask({ key, fallback }) {
        asked.push({ key, fallback });
        return replies[key] ?? "";
      },
    };
    await init({ repoRoot: root, answers: {}, prompter, run: noCommands });

    const keys = asked.map(({ key }) => key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain("fillWeb");
    expect(asked.find(({ key }) => key === "firebase.storageBucket")?.fallback).toBe(
      "jci-valle.firebasestorage.app",
    );
    expect(loadProfile({ repoRoot: root, profile: "jci-valle" }).brand.foundedYear).toBe(1990);
  });

  it("does not ask what the answers file already gives", async () => {
    const asked: string[] = [];
    const prompter: Prompter = {
      async ask({ key, fallback }) {
        asked.push(key);
        return fallback ?? "";
      },
    };
    await init({ repoRoot: root, answers: minimalAnswers(), prompter, run: noCommands });
    expect(asked).not.toContain("name");
    expect(asked).not.toContain("firebase.projectId");
    expect(asked).toContain("firebase.storageBucket");
  });

  function scripted(
    replies: Record<string, string[]>,
    seen: { key: string; error?: string }[] = [],
  ) {
    const prompter: Prompter = {
      async ask({ key, fallback, error }) {
        seen.push({ key, error });
        return replies[key]?.shift() ?? fallback ?? "";
      },
    };
    return prompter;
  }

  it("re-asks a slug that is malformed or taken, and a year that is not a number", async () => {
    const seen: { key: string; error?: string }[] = [];
    const answers = minimalAnswers();
    delete answers.slug;
    delete answers.foundedYear;
    const prompter = scripted(
      { slug: ["Bad Slug", "jci-oriente", "jci-valle"], foundedYear: ["1,990", "1990"] },
      seen,
    );
    await init({ repoRoot: root, answers, prompter, run: noCommands });
    const errors = (key: string) => seen.filter((entry) => entry.key === key).map((e) => e.error);
    expect(errors("slug")).toEqual([
      undefined,
      expect.stringMatching(/kebab-case/),
      expect.stringMatching(/brand\/jci-oriente already exists/),
    ]);
    expect(errors("foundedYear")).toEqual([undefined, expect.stringMatching(/whole number/)]);
    expect(loadProfile({ repoRoot: root, profile: "jci-valle" }).brand.foundedYear).toBe(1990);
  });

  it("saves the answers for --answers when a later step fails", async () => {
    const answers = minimalAnswers();
    delete answers.name;
    const failing: CommandRunner = async () => {
      throw new CommandError("firebase apps:sdkconfig failed: not logged in");
    };
    const error = await init({
      repoRoot: root,
      answers,
      prompter: scripted({ name: ["JCI Valle"] }),
      fillWeb: true,
      run: failing,
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(BrandConfigError);
    expect(String(error)).toMatch(
      /not logged in[\s\S]*pnpm brand:init --answers \/.*\/brand-init-answers\.json --sdkconfig {3}# in the repo root/,
    );
    const saved = JSON.parse(readFileSync(join(root, "brand-init-answers.json"), "utf8"));
    expect(saved).toMatchObject({ slug: "jci-valle", name: "JCI Valle" });
    expect(existsSync(join(root, "brand/jci-valle"))).toBe(false);
  });

  it("saves nothing in --answers mode, where the file already holds the answers", async () => {
    const answers = minimalAnswers();
    delete answers.name;
    await expect(init({ repoRoot: root, answers, run: noCommands })).rejects.toThrow(/name/);
    expect(existsSync(join(root, "brand-init-answers.json"))).toBe(false);
  });
});

describe("init guidance", () => {
  it("lists the next steps with their commands", () => {
    const runs = initNext("jci-valle").map(({ change, run }) => run ?? change);
    expect(runs).toEqual([
      expect.stringMatching(/^edit brand\/jci-valle\/site-content\.json/),
      "pnpm brand:check",
      "pnpm brand:doctor",
      "git add brand/jci-valle/ luminova.json",
    ]);
  });

  it("says where to find an app id that belongs to another project", async () => {
    const answers = minimalAnswers();
    const other: CommandRunner = async (_command, args) =>
      JSON.stringify({
        result: {
          sdkConfig: {
            projectId: "someone-else",
            appId: args[2],
            apiKey: "k",
            authDomain: "d",
            messagingSenderId: "1",
          },
        },
      });
    const error = await init({ repoRoot: root, answers, fillWeb: true, run: other }).catch(
      (e: unknown) => e,
    );
    expect(error instanceof BrandConfigError ? error.remedies : []).toEqual([
      expect.objectContaining({ console: "Firebase console → Project settings → Your apps" }),
    ]);
  });

  it("points an incomplete answers file at the schema", async () => {
    const answers = minimalAnswers();
    delete answers.name;
    const error = await init({ repoRoot: root, answers, run: noCommands }).catch((e: unknown) => e);
    expect(error instanceof BrandConfigError ? error.remedies[0]?.change : "").toMatch(
      /brand\/brand\.schema\.json/,
    );
  });
});
