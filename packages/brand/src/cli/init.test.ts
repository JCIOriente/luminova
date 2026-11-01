import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ASSET_CONTRACT, ICON_MASTER_FILE } from "../assets.ts";
import { BrandConfigError, EXAMPLE_PROFILE, loadProfile } from "../load-profile.ts";
import { exampleRepo } from "../test-profiles.ts";
import { CommandError, type CommandRunner } from "./gcloud.ts";
import { ANSWERS_FILE, connect, init, initNext, runInit } from "./init.ts";
import type { Prompter } from "./prompts.ts";
import { isTable } from "../schema.ts";
import { seedLocal } from "./seed.ts";

const SPOTLIGHT_APP = "1:111222333:web:aaa";
const BACKSTAGE_APP = "1:111222333:web:bbb";

function minimalAnswers(): Record<string, unknown> {
  return {
    name: "JCI Valle",
    city: "Cochabamba",
    country: "Bolivia",
    foundedYear: 1990,
    colors: { spotlight: "#0097D7" },
    project: "jci-valle",
    firebase: {
      spotlight: { appId: SPOTLIGHT_APP, apiKey: "key-spotlight" },
      backstage: { appId: BACKSTAGE_APP, apiKey: "key-backstage" },
    },
  };
}

const LOCAL = "brand/local";
const brandToml = () => join(root, LOCAL, "brand.toml");

let root: string;
let calls: string[][];
const noCommands: CommandRunner = async (command, args) => {
  calls.push([command, ...args]);
  throw new Error("no command expected");
};

beforeEach(() => {
  root = exampleRepo("brand-init-");
  calls = [];
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("init from an answers file", () => {
  it("writes a minimal brand.toml the loader accepts, everything else from the example", async () => {
    await init({ repoRoot: root, answers: minimalAnswers(), run: noCommands });

    const profile = loadProfile({ repoRoot: root, profile: "local" });
    const { brand } = profile;
    expect(brand.firebase).toMatchObject({
      storageBucket: "jci-valle.firebasestorage.app",
      sites: { spotlight: "jci-valle", backstage: "jci-valle-backstage" },
      web: {
        authDomain: "jci-valle.firebaseapp.com",
        messagingSenderId: "111222333",
        spotlight: { apiKey: "key-spotlight", appCheckSiteKey: "", vapidKey: "" },
      },
    });
    expect(brand.assetsBucket).toBe("jci-valle-brand-assets");
    expect(brand.qrPrefix).toBe("jcivalle");
    expect(brand.foundedYear).toBe(1990);
    expect(brand.shortName).toBe("JCI Valle");
    expect(brand.seo.ogTitle).toBe("JCI Valle: Cámara Junior Internacional en Cochabamba");
    expect(brand.locality.cityFormal).toBe("Cochabamba");
    expect(profile.siteContent.contact.location).toBe("Cochabamba, Bolivia");
    expect(calls).toEqual([]);
  });

  it("takes every other value from the example profile", async () => {
    await init({ repoRoot: root, answers: minimalAnswers(), run: noCommands });
    const example = loadProfile({ repoRoot: root, profile: EXAMPLE_PROFILE }).brand;
    const { brand } = loadProfile({ repoRoot: root, profile: "local" });
    expect(brand.themeColor).toEqual({
      spotlight: "#0097D7",
      backstage: example.themeColor.backstage,
    });
    expect(brand.locale).toBe(example.locale);
    expect(brand.movementName).toBe(example.movementName);
  });

  it("starts the file with the #:schema line and holds only the identity, the year and the project", async () => {
    await init({ repoRoot: root, answers: minimalAnswers(), run: noCommands });
    const written = readFileSync(brandToml(), "utf8");
    expect(written.split("\n")[0]).toBe("#:schema ../brand.schema.json");
    const keys = written
      .split("\n")
      .filter((line) => /^\s*[\w[]/.test(line))
      .map((line) => line.split(/\s*=/)[0]);
    expect(keys).toEqual([
      "name",
      "city",
      "country",
      "project",
      "foundedYear",
      "[colors]",
      "spotlight",
      "[firebase.spotlight]",
      "apiKey",
      "appId",
      "[firebase.backstage]",
      "apiKey",
      "appId",
    ]);
  });

  it("writes the asset README", async () => {
    await init({ repoRoot: root, answers: minimalAnswers(), run: noCommands });
    const readme = readFileSync(join(root, LOCAL, "README.txt"), "utf8");
    for (const { path } of ASSET_CONTRACT) expect(readme).toContain(path);
    expect(readme).toContain("1200×630");
    expect(readme).toMatch(/never commit/i);
    expect(readme).toContain(ICON_MASTER_FILE);
    expect(readme).toContain("pnpm brand:icons");
  });

  it("becomes the profile brand/ selects and writes .firebaserc, but not CD's switch", async () => {
    const { files } = await init({ repoRoot: root, answers: minimalAnswers(), run: noCommands });
    expect(files).toContain(".firebaserc");
    expect(files).not.toContain("luminova.json");
    expect(existsSync(join(root, "luminova.json"))).toBe(false);
    expect(loadProfile({ repoRoot: root, env: {} })).toMatchObject({
      slug: "local",
      source: "local",
    });
    expect(JSON.parse(readFileSync(join(root, ".firebaserc"), "utf8")).projects.default).toBe(
      "jci-valle",
    );
    // "deploy" switches CD on; it comes at brand:provision step 2, never from init.
    expect(loadProfile({ repoRoot: root, profile: "local" }).brand.deploy).toBeUndefined();
  });

  it("seeds a missing brand/local/ first, so the example's images run until the chapter's arrive", async () => {
    await init({ repoRoot: root, answers: minimalAnswers(), run: noCommands });
    expect(readFileSync(join(root, LOCAL, "og-image.png"))).toEqual(
      readFileSync(join(root, "brand/example/assets/og-image.png")),
    );
    const manifest = JSON.parse(readFileSync(join(root, LOCAL, ".pull-manifest.json"), "utf8"));
    expect(manifest.objects["og-image.png"].source).toBe("example");
  });

  it("keeps an existing brand/local/README.txt and every other file there", async () => {
    mkdirSync(join(root, LOCAL), { recursive: true });
    writeFileSync(join(root, LOCAL, "README.txt"), "mine");
    writeFileSync(join(root, LOCAL, "icon-master.svg"), "<svg/>");
    await init({ repoRoot: root, answers: minimalAnswers(), run: noCommands });
    expect(readFileSync(join(root, LOCAL, "README.txt"), "utf8")).toBe("mine");
    expect(readFileSync(join(root, LOCAL, "icon-master.svg"), "utf8")).toBe("<svg/>");
  });

  it("lists every missing required value at once and writes nothing", async () => {
    const answers = minimalAnswers();
    delete answers.name;
    delete answers.city;
    const error = await init({ repoRoot: root, answers, run: noCommands }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BrandConfigError);
    const message = String(error);
    expect(message).toMatch(/brand\/local\/brand\.toml name: required/);
    expect(message).toMatch(/brand\/local\/brand\.toml city: required/);
    expect(existsSync(join(root, LOCAL))).toBe(false);
  });

  it("replaces the seeded brand.toml without asking", async () => {
    seedLocal({ repoRoot: root, env: {} });
    await init({ repoRoot: root, answers: minimalAnswers(), run: noCommands });
    expect(loadProfile({ repoRoot: root, env: {} }).brand.name).toBe("JCI Valle");
  });

  it("refuses to replace a chapter's own brand.toml unless told to, before asking anything", async () => {
    await init({ repoRoot: root, answers: minimalAnswers(), run: noCommands });
    const before = readFileSync(brandToml(), "utf8");
    const seen: string[] = [];
    const prompter: Prompter = {
      async ask({ key }) {
        seen.push(key);
        return "";
      },
    };
    const second = init({ repoRoot: root, answers: {}, prompter, run: noCommands });
    await expect(second).rejects.toThrow(
      /brand\/local\/brand\.toml already holds your chapter's brand[\s\S]*pnpm brand:init {3}# in the repo root/,
    );
    expect(seen).toEqual([]);
    expect(readFileSync(brandToml(), "utf8")).toBe(before);
    const answers = { ...minimalAnswers(), name: "JCI Valle Nueva" };
    await init({ repoRoot: root, answers, replace: true, run: noCommands });
    expect(loadProfile({ repoRoot: root, env: {} }).brand.name).toBe("JCI Valle Nueva");
  });

  it("refuses an answer it never asks, before writing", async () => {
    const answers = { ...minimalAnswers(), locality: { region: "el valle" } };
    await expect(init({ repoRoot: root, answers, run: noCommands })).rejects.toThrow(
      /brand-init-answers: "locality" is not an answer brand:init takes/,
    );
    expect(existsSync(join(root, LOCAL))).toBe(false);
  });

  it("says an answer it cannot write is no syntax error in the member's file", async () => {
    const answers = { ...minimalAnswers(), name: "JCI\u007fValle" };
    const error = await init({ repoRoot: root, answers, run: noCommands }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BrandConfigError);
    expect(String(error)).toMatch(
      /brand:init built brand\/local\/brand\.toml from your answers, but it does not parse/,
    );
    expect(String(error)).not.toMatch(/fix the TOML syntax/);
    expect(existsSync(join(root, LOCAL))).toBe(false);
  });
});

describe("init reading the API keys (firebase apps:sdkconfig)", () => {
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
    answers.firebase = { spotlight: { appId: SPOTLIGHT_APP }, backstage: { appId: BACKSTAGE_APP } };
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
    const { web } = loadProfile({ repoRoot: root, profile: "local" }).brand.firebase;
    expect(web.spotlight.apiKey).toBe(`key-for-${SPOTLIGHT_APP}`);
    expect(web.backstage.apiKey).toBe(`key-for-${BACKSTAGE_APP}`);
    expect(web.messagingSenderId).toBe("111222333");
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
    expect(existsSync(join(root, LOCAL))).toBe(false);
  });
});

describe("init interactively", () => {
  it("asks each question once, offering the derived default", async () => {
    const asked: { key: string; fallback: string | undefined }[] = [];
    const replies: Record<string, string> = {
      name: "JCI Valle",
      city: "Cochabamba",
      country: "Bolivia",
      foundedYear: "1990",
      project: "jci-valle",
      "firebase.spotlight.appId": SPOTLIGHT_APP,
      "firebase.backstage.appId": BACKSTAGE_APP,
      hasProject: "y",
      fillWeb: "n",
      "firebase.spotlight.apiKey": "key-spotlight",
      "firebase.backstage.apiKey": "key-backstage",
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
    expect(keys).toContain("foundedYear");
    expect(asked.find(({ key }) => key === "foundedYear")?.fallback).toBeUndefined();
    expect(loadProfile({ repoRoot: root, profile: "local" }).brand.foundedYear).toBe(1990);
    expect(asked.find(({ key }) => key === "colors.spotlight")?.fallback).toBe("#336699");
    expect(loadProfile({ repoRoot: root, profile: "local" }).brand.themeColor.spotlight).toBe(
      "#336699",
    );
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
    expect(asked).not.toContain("project");
    expect(asked).toContain("firebase.spotlight.appCheckSiteKey");
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

  it("re-asks a year that is no number, and a color that is no #RRGGBB", async () => {
    const seen: { key: string; error?: string }[] = [];
    const answers = minimalAnswers();
    delete answers.foundedYear;
    delete answers.colors;
    const prompter = scripted(
      {
        foundedYear: ["1,990", "1990"],
        "colors.spotlight": ["blue", "#0097D7"],
      },
      seen,
    );
    await init({ repoRoot: root, answers, prompter, run: noCommands });
    const errors = (key: string) => seen.filter((entry) => entry.key === key).map((e) => e.error);
    expect(errors("foundedYear")).toEqual([undefined, expect.stringMatching(/whole number/)]);
    expect(errors("colors.spotlight")).toEqual([undefined, expect.stringMatching(/#RRGGBB/)]);
    const { brand } = loadProfile({ repoRoot: root, profile: "local" });
    expect(brand.themeColor.spotlight).toBe("#0097D7");
    expect(brand.foundedYear).toBe(1990);
  });

  it("saves the answers for the next try when a later step fails", async () => {
    const answers = minimalAnswers();
    delete answers.name;
    const failing: CommandRunner = async () => {
      throw new CommandError("firebase apps:sdkconfig failed: not logged in");
    };
    const error = await init({
      repoRoot: root,
      answers,
      // "y" to the sdkconfig question, not the flag: the re-run must still carry it.
      prompter: scripted({ name: ["JCI Valle"], fillWeb: ["y"] }),
      run: failing,
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(BrandConfigError);
    expect(String(error)).toMatch(
      /not logged in[\s\S]*run it again and answer y to use them\n {6}pnpm brand:init {3}# in the repo root/,
    );
    const saved = JSON.parse(readFileSync(join(root, "brand-init-answers.json"), "utf8"));
    expect(saved).toMatchObject({ name: "JCI Valle" });
    expect(existsSync(join(root, LOCAL))).toBe(false);
  });

  it("saves nothing without a prompter, where the answers came from a file", async () => {
    const answers = minimalAnswers();
    delete answers.name;
    await expect(init({ repoRoot: root, answers, run: noCommands })).rejects.toThrow(/name/);
    expect(existsSync(join(root, "brand-init-answers.json"))).toBe(false);
  });
});

function localAnswers(): Record<string, unknown> {
  const chapter = minimalAnswers();
  delete chapter.project;
  delete chapter.firebase;
  return chapter;
}

describe("init without a Firebase project (local-only)", () => {
  it("writes a profile that runs only in the emulators, with no cloud question", async () => {
    const { local, files } = await init({
      repoRoot: root,
      answers: localAnswers(),
      local: true,
      run: noCommands,
    });
    expect(local).toBe(true);
    expect(files).toContain(".firebaserc");
    const { brand } = loadProfile({ repoRoot: root, env: {} });
    expect(brand.firebase.projectId).toBe("demo-jci-valle");
    expect(brand.firebase.sites).toEqual({
      spotlight: "demo-jci-valle",
      backstage: "demo-jci-valle-backstage",
    });
    expect(brand.firebase.web.spotlight.appCheckSiteKey).toBe("");
    expect(brand.deploy).toBeUndefined();
    expect(readFileSync(brandToml(), "utf8")).not.toMatch(/\[firebase/);
    expect(calls).toEqual([]);
  });

  it("asks whether a project exists, and a blank answer means local", async () => {
    const asked: string[] = [];
    const prompter: Prompter = {
      async ask({ key }) {
        asked.push(key);
        return "";
      },
    };
    const { local } = await init({
      repoRoot: root,
      answers: localAnswers(),
      prompter,
      run: noCommands,
    });
    expect(local).toBe(true);
    expect(asked).toContain("hasProject");
    expect(asked.filter((key) => key.startsWith("firebase."))).toEqual([]);
  });

  it("refuses --local with a project it would otherwise throw away", async () => {
    await expect(
      init({ repoRoot: root, answers: minimalAnswers(), local: true, run: noCommands }),
    ).rejects.toThrow(/a project and its web apps/);
  });

  it("saves a failed local run so the next try accepts the file", async () => {
    const prompter: Prompter = {
      async ask({ fallback }) {
        return fallback ?? "";
      },
    };
    const answers = { ...localAnswers(), colors: { spotlight: "#00000G" } };
    const error = await init({
      repoRoot: root,
      answers,
      prompter,
      local: true,
      run: noCommands,
    }).catch((caught: unknown) => caught);
    expect(String(error)).toMatch(
      /\[colors\] spotlight[\s\S]*pnpm brand:init {3}# in the repo root/,
    );
    const saved = JSON.parse(readFileSync(join(root, "brand-init-answers.json"), "utf8"));
    expect(saved.firebase).toBeUndefined();
    expect(saved.project).toBeUndefined();
    saved.colors.spotlight = "#0097D7";
    const rerun = await init({ repoRoot: root, answers: saved, local: true, run: noCommands });
    expect(rerun.local).toBe(true);
  });

  it("names the demo project after the chapter, within Firebase's 30 characters", async () => {
    const answers = { ...localAnswers(), name: "JCI Á Very Long Chapter Name Indeed" };
    await init({ repoRoot: root, answers, local: true, run: noCommands });
    const { projectId } = loadProfile({ repoRoot: root, env: {} }).brand.firebase;
    expect(projectId.length).toBeLessThanOrEqual(30);
    expect(projectId).toMatch(/^demo-[a-z0-9-]*[a-z0-9]$/);
  });
});

const projectAnswers = () => {
  const { project, firebase } = minimalAnswers();
  return { project, firebase };
};

describe("connect", () => {
  it("replaces a local profile's demo project with the real one, keeping the rest of the file", async () => {
    await init({ repoRoot: root, answers: localAnswers(), local: true, run: noCommands });
    writeFileSync(
      brandToml(),
      `${readFileSync(brandToml(), "utf8")}\n# our motto\n[hero]\nmotto = "Hola {city}"\n`,
    );
    const result = await connect({ repoRoot: root, answers: projectAnswers(), run: noCommands });
    expect(result).toEqual({ slug: "local", projectId: "jci-valle" });
    const { brand, siteContent } = loadProfile({ repoRoot: root, env: {} });
    expect(brand.name).toBe("JCI Valle");
    expect(brand.firebase.sites.backstage).toBe("jci-valle-backstage");
    expect(brand.firebase.web.spotlight.apiKey).toBe("key-spotlight");
    expect(brand.assetsBucket).toBe("jci-valle-brand-assets");
    expect(brand.deploy).toBeUndefined();
    expect(siteContent.hero.motto).toBe("Hola Cochabamba");
    const written = readFileSync(brandToml(), "utf8");
    expect(written).toContain("# our motto\n[hero]");
    expect(written.split("\n")[0]).toBe("#:schema ../brand.schema.json");
    expect(written.match(/^project = .*$/gm)).toEqual(['project = "jci-valle"']);
    expect(JSON.parse(readFileSync(join(root, ".firebaserc"), "utf8")).projects.default).toBe(
      "jci-valle",
    );
  });

  it("re-connects a connected profile, keeping [deploy] only for the same project", async () => {
    await init({ repoRoot: root, answers: localAnswers(), local: true, run: noCommands });
    await connect({ repoRoot: root, answers: projectAnswers(), run: noCommands });
    const deploy = {
      workloadIdentityProvider:
        "projects/111222333/locations/global/workloadIdentityPools/github-actions/providers/github-oidc",
      serviceAccount: "firebase-deployer@jci-valle.iam.gserviceaccount.com",
    };
    writeFileSync(
      brandToml(),
      `${readFileSync(brandToml(), "utf8")}\n[deploy]\nworkloadIdentityProvider = "${deploy.workloadIdentityProvider}"\nserviceAccount = "${deploy.serviceAccount}"\n`,
    );

    await connect({ repoRoot: root, answers: projectAnswers(), run: noCommands });
    expect(loadProfile({ repoRoot: root, env: {} }).brand.deploy).toEqual(deploy);

    const other = { ...projectAnswers(), project: "jci-valle-2" };
    await connect({ repoRoot: root, answers: other, run: noCommands });
    const moved = loadProfile({ repoRoot: root, env: {} }).brand;
    expect(moved.firebase.projectId).toBe("jci-valle-2");
    expect(moved.deploy).toBeUndefined();
    // Printed credentials carry the old prefix: moving project must not change it.
    expect(moved.qrPrefix).toBe("jcivalle");
  });

  it("moves project again and again, pinning the QR prefix once", async () => {
    await init({ repoRoot: root, answers: localAnswers(), local: true, run: noCommands });
    await connect({ repoRoot: root, answers: projectAnswers(), run: noCommands });
    for (const project of ["jci-valle-2", "jci-valle-3"]) {
      await connect({ repoRoot: root, answers: { ...projectAnswers(), project }, run: noCommands });
    }
    expect(readFileSync(brandToml(), "utf8").match(/^qrPrefix\b.*$/gm)).toEqual([
      'qrPrefix = "jcivalle"',
    ]);
    const { brand } = loadProfile({ repoRoot: root, env: {} });
    expect(brand.firebase.projectId).toBe("jci-valle-3");
    expect(brand.qrPrefix).toBe("jcivalle");
  });

  it("keeps the comments that lead into the table after a replaced one", async () => {
    await init({ repoRoot: root, answers: localAnswers(), local: true, run: noCommands });
    await connect({ repoRoot: root, answers: projectAnswers(), run: noCommands });
    writeFileSync(
      brandToml(),
      `${readFileSync(brandToml(), "utf8")}\n# our motto\n\n# still ours\n[hero]\nmotto = "Hola"\n`,
    );
    await connect({ repoRoot: root, answers: projectAnswers(), run: noCommands });
    const written = readFileSync(brandToml(), "utf8");
    expect(written).toContain('\n# our motto\n\n# still ours\n[hero]\nmotto = "Hola"\n');
    expect(written.match(/^\[firebase\.spotlight\]$/gm)).toHaveLength(1);
  });

  it("re-connecting the same project keeps App Check keys a blank answer would erase", async () => {
    await init({ repoRoot: root, answers: localAnswers(), local: true, run: noCommands });
    await connect({ repoRoot: root, answers: projectAnswers(), run: noCommands });
    writeFileSync(
      brandToml(),
      readFileSync(brandToml(), "utf8").replace(
        `appId = "${SPOTLIGHT_APP}"`,
        `appId = "${SPOTLIGHT_APP}"\nappCheckSiteKey = "site-key"`,
      ),
    );
    // Only the project id is answered; every other question falls back.
    const prompter: Prompter = {
      async ask({ key }) {
        return key === "project" ? "jci-valle" : "";
      },
    };
    await connect({ repoRoot: root, prompter, run: noCommands });
    const { web } = loadProfile({ repoRoot: root, env: {} }).brand.firebase;
    expect(web.spotlight.appCheckSiteKey).toBe("site-key");
    expect(web.spotlight.apiKey).toBe("key-spotlight");
  });

  it("re-connecting the same project offers its values as defaults a reply can replace", async () => {
    await init({ repoRoot: root, answers: localAnswers(), local: true, run: noCommands });
    await connect({ repoRoot: root, answers: projectAnswers(), run: noCommands });
    const offered: Record<string, string | undefined> = {};
    const prompter: Prompter = {
      async ask({ key, fallback }) {
        offered[key] = fallback;
        if (key === "project") return "jci-valle";
        return key === "firebase.spotlight.apiKey" ? "new-key" : "";
      },
    };
    await connect({ repoRoot: root, prompter, run: noCommands });
    expect(offered["firebase.backstage.apiKey"]).toBe("key-backstage");
    const { web } = loadProfile({ repoRoot: root, env: {} }).brand.firebase;
    expect(web.spotlight.apiKey).toBe("new-key");
    expect(web.backstage.apiKey).toBe("key-backstage");
  });

  it("saves typed project answers when a later step fails", async () => {
    await init({ repoRoot: root, answers: localAnswers(), local: true, run: noCommands });
    const failing: CommandRunner = async () => {
      throw new CommandError("firebase apps:sdkconfig failed: not logged in");
    };
    const replies: Record<string, string> = {
      project: "jci-valle",
      "firebase.spotlight.appId": SPOTLIGHT_APP,
      "firebase.backstage.appId": BACKSTAGE_APP,
      fillWeb: "y",
    };
    const prompter: Prompter = {
      async ask({ key, fallback }) {
        return replies[key] ?? fallback ?? "";
      },
    };
    const error = await connect({
      repoRoot: root,
      prompter,
      run: failing,
    }).catch((caught: unknown) => caught);
    expect(String(error)).toMatch(
      /answer y to use them\n {6}pnpm brand:init {3}# in the repo root/,
    );
    const saved = JSON.parse(readFileSync(join(root, "brand-init-answers.json"), "utf8"));
    expect(saved.project).toBe("jci-valle");
  });

  it("asks only the Firebase questions", async () => {
    await init({ repoRoot: root, answers: localAnswers(), local: true, run: noCommands });
    const asked: string[] = [];
    const replies: Record<string, string> = {
      project: "jci-valle",
      "firebase.spotlight.appId": SPOTLIGHT_APP,
      "firebase.backstage.appId": BACKSTAGE_APP,
      "firebase.spotlight.apiKey": "k1",
      "firebase.backstage.apiKey": "k2",
    };
    const prompter: Prompter = {
      async ask({ key }) {
        asked.push(key);
        return replies[key] ?? "";
      },
    };
    await connect({ repoRoot: root, prompter, run: noCommands });
    expect(asked.filter((key) => !key.startsWith("firebase."))).toEqual(["project", "fillWeb"]);
  });
});

describe("init guidance", () => {
  it("lists the next steps with their commands", () => {
    const runs = initNext().map(({ change, run }) => run ?? change);
    expect(runs).toEqual([
      "pnpm brand:check",
      expect.stringMatching(/^edit brand\/local\/brand\.toml/),
      "pnpm dev",
      "pnpm brand:check",
    ]);
    expect(JSON.stringify(runs)).not.toMatch(/git add/);
    // A local-only profile ends with going live, as a choice, not a deploy.
    const local = initNext({ local: true });
    expect(local.at(-1)).toMatchObject({ run: "pnpm brand:init" });
    expect(local.at(-1)?.change).toMatch(/^when you are ready to go live/);
    expect(JSON.stringify(local)).not.toMatch(/deploy/);
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

/** Answers as a prompter's replies: every leaf at its dotted key. */
function stringAnswers(answers: Record<string, unknown>, prefix = ""): Record<string, string> {
  return Object.fromEntries(
    Object.entries(answers).flatMap(([key, value]) =>
      isTable(value)
        ? Object.entries(stringAnswers(value, `${prefix}${key}.`))
        : [[`${prefix}${key}`, String(value)]],
    ),
  );
}

describe("runInit, the command", () => {
  const answering = (replies: Record<string, string>, asked: string[] = []): Prompter => ({
    async ask({ key, label, fallback }) {
      asked.push(`${key}: ${label}`);
      return replies[key] ?? fallback ?? "";
    },
  });
  const saveAnswers = (answers: Record<string, unknown>) =>
    writeFileSync(join(root, ANSWERS_FILE), JSON.stringify(answers));

  it("refuses without a terminal, since it asks questions", async () => {
    await expect(runInit({ repoRoot: root, run: noCommands })).rejects.toThrow(/needs a terminal/);
  });

  it("creates the profile from saved answers when asked to use them, then removes the file", async () => {
    saveAnswers(minimalAnswers());
    const asked: string[] = [];
    const text = await runInit({
      repoRoot: root,
      prompter: answering({ useSaved: "y" }, asked),
      run: noCommands,
    });
    expect(asked[0]).toBe(
      `useSaved: Use the answers saved from your last try (${ANSWERS_FILE})? (y/N)`,
    );
    expect(text).toMatch(/^brand:init: wrote brand\/local\/brand\.toml/);
    expect(existsSync(join(root, ANSWERS_FILE))).toBe(false);
  });

  it("starts over when the saved answers are declined, and keeps the file", async () => {
    saveAnswers(minimalAnswers());
    const asked: string[] = [];
    await runInit({ repoRoot: root, prompter: answering({}, asked), run: noCommands }).catch(
      () => undefined,
    );
    expect(asked.map((line) => line.split(":")[0])).toContain("name");
    expect(existsSync(join(root, ANSWERS_FILE))).toBe(true);
  });

  it("writes over the seeded brand/local/ without the connect question", async () => {
    seedLocal({ repoRoot: root, env: {} });
    saveAnswers(minimalAnswers());
    const asked: string[] = [];
    await runInit({
      repoRoot: root,
      prompter: answering({ useSaved: "y" }, asked),
      run: noCommands,
    });
    expect(asked.map((line) => line.split(":")[0])).not.toContain("connect");
    expect(loadProfile({ repoRoot: root, env: {} }).brand.name).toBe("JCI Valle");
  });

  describe("with a chapter's own brand.toml in brand/local/", () => {
    beforeEach(async () => {
      await init({ repoRoot: root, answers: localAnswers(), local: true, run: noCommands });
    });

    it("offers to connect a local-only chapter, then to start over; no and no change nothing", async () => {
      const before = readFileSync(brandToml(), "utf8");
      const asked: string[] = [];
      const text = await runInit({
        repoRoot: root,
        prompter: answering({}, asked),
        run: noCommands,
      });
      expect(asked).toEqual([
        "connect: brand/local/ runs on this computer only. Connect it to a Firebase project now? (y/N)",
        "replace: Replace brand/local/brand.toml with a new one, answering every question again? (y/N)",
      ]);
      expect(text).toMatch(/^brand:init: nothing changed/);
      expect(readFileSync(brandToml(), "utf8")).toBe(before);
    });

    it("starts over on a yes to the second question", async () => {
      const text = await runInit({
        repoRoot: root,
        prompter: answering({
          replace: "y",
          hasProject: "y",
          fillWeb: "n",
          ...stringAnswers(minimalAnswers()),
        }),
        run: noCommands,
      });
      expect(text).toMatch(/^brand:init: wrote brand\/local\/brand\.toml/);
      expect(loadProfile({ repoRoot: root, env: {} }).localOnly).toBe(false);
    });

    it("connects it on a yes, and drops declined saved answers once that succeeds", async () => {
      saveAnswers({ project: "someone-else" });
      const text = await runInit({
        repoRoot: root,
        prompter: answering({
          useSaved: "n",
          connect: "y",
          project: "jci-valle",
          "firebase.spotlight.appId": SPOTLIGHT_APP,
          "firebase.backstage.appId": BACKSTAGE_APP,
          "firebase.spotlight.apiKey": "k1",
          "firebase.backstage.apiKey": "k2",
        }),
        run: noCommands,
      });
      expect(text).toMatch(/now uses Firebase project jci-valle/);
      expect(loadProfile({ repoRoot: root, env: {} }).localOnly).toBe(false);
      expect(existsSync(join(root, ANSWERS_FILE))).toBe(false);
    });
  });
});
