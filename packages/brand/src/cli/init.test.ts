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
import { ASSET_CONTRACT, ICON_MASTER_FILE } from "../assets.ts";
import { BrandConfigError, REPO_ROOT, loadProfile } from "../load-profile.ts";
import { PULLED_ASSETS_DIR } from "../release.ts";
import { CommandError, type CommandRunner } from "./gcloud.ts";
import { ANSWERS_FILE, connect, init, initNext, runInit } from "./init.ts";
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
    expect(readme).toContain(ICON_MASTER_FILE);
    expect(readme).toContain("pnpm brand:icons");
  });

  it("becomes the profile brand/ selects and writes .firebaserc, but not CD's switch", async () => {
    const { files } = await init({ repoRoot: root, answers: minimalAnswers(), run: noCommands });
    expect(files).toContain(".firebaserc");
    expect(files).not.toContain("luminova.json");
    expect(existsSync(join(root, "luminova.json"))).toBe(false);
    expect(loadProfile({ repoRoot: root, env: {} })).toMatchObject({
      slug: "jci-valle",
      source: "chapter",
    });
    expect(JSON.parse(readFileSync(join(root, ".firebaserc"), "utf8")).projects.default).toBe(
      "jci-valle",
    );
    // "deploy" switches CD on; it comes at brand:provision step 2, never from init.
    expect(loadProfile({ repoRoot: root, profile: "jci-valle" }).brand.deploy).toBeUndefined();
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
    delete answers.backstage;
    const error = await init({ repoRoot: root, answers, run: noCommands }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BrandConfigError);
    const message = String(error);
    expect(message).toMatch(/name/);
    expect(message).toMatch(/backstage/);
    expect(existsSync(join(root, "brand/jci-valle"))).toBe(false);
    expect(existsSync(join(root, PULLED_ASSETS_DIR))).toBe(false);
  });

  it("refuses to overwrite an existing profile", async () => {
    const answers = { ...minimalAnswers(), slug: "jci-oriente" };
    await expect(init({ repoRoot: root, answers, run: noCommands })).rejects.toThrow(
      /brand\/jci-oriente already exists/,
    );
  });

  it("refuses a second chapter profile before asking anything", async () => {
    await init({ repoRoot: root, answers: minimalAnswers(), run: noCommands });
    const seen: string[] = [];
    const prompter: Prompter = {
      async ask({ key }) {
        seen.push(key);
        return "";
      },
    };
    const second = init({ repoRoot: root, answers: {}, prompter, run: noCommands });
    await expect(second).rejects.toThrow(
      /brand\/jci-valle\/ already is this repository's chapter[\s\S]*pnpm brand:init {3}# in the repo root/,
    );
    expect(seen).toEqual([]);
  });

  it("refuses a malformed slug before writing", async () => {
    const answers = { ...minimalAnswers(), slug: "../escape" };
    await expect(init({ repoRoot: root, answers, run: noCommands })).rejects.toThrow(/kebab-case/);
    expect(existsSync(join(root, "escape"))).toBe(false);
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
      hasProject: "y",
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
    expect(saved).toMatchObject({ slug: "jci-valle", name: "JCI Valle" });
    expect(existsSync(join(root, "brand/jci-valle"))).toBe(false);
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

  it("refuses --local with a firebase block it would otherwise throw away", async () => {
    await expect(
      init({ repoRoot: root, answers: minimalAnswers(), local: true, run: noCommands }),
    ).rejects.toThrow(/"firebase" block/);
  });

  it("saves a failed local run so the next try accepts the file", async () => {
    mkdirSync(join(root, "brand/jci-valle"), { recursive: true });
    const prompter: Prompter = {
      async ask({ key, fallback }) {
        return (localAnswers() as Record<string, unknown>)[key] === undefined
          ? (fallback ?? "")
          : "";
      },
    };
    const error = await init({
      repoRoot: root,
      answers: localAnswers(),
      prompter,
      local: true,
      run: noCommands,
    }).catch((caught: unknown) => caught);
    expect(String(error)).toMatch(/already exists[\s\S]*pnpm brand:init {3}# in the repo root/);
    const saved = JSON.parse(readFileSync(join(root, "brand-init-answers.json"), "utf8"));
    expect(saved.firebase).toBeUndefined();
    rmSync(join(root, "brand/jci-valle"), { recursive: true });
    const rerun = await init({ repoRoot: root, answers: saved, local: true, run: noCommands });
    expect(rerun.local).toBe(true);
  });

  it("keeps a long slug's demo project within Firebase's 30 characters", async () => {
    const answers = { ...localAnswers(), slug: "jci-a-very-long-chapter-name-indeed" };
    await init({ repoRoot: root, answers, local: true, run: noCommands });
    const { projectId } = loadProfile({ repoRoot: root, env: {} }).brand.firebase;
    expect(projectId.length).toBeLessThanOrEqual(30);
    expect(projectId).toMatch(/^demo-[a-z0-9-]*[a-z0-9]$/);
  });
});

describe("connect", () => {
  it("replaces a local profile's demo project with the real one", async () => {
    await init({ repoRoot: root, answers: localAnswers(), local: true, run: noCommands });
    const { firebase } = minimalAnswers() as { firebase: Record<string, unknown> };
    const result = await connect({ repoRoot: root, answers: { firebase }, run: noCommands });
    expect(result).toEqual({ slug: "jci-valle", projectId: "jci-valle" });
    const { brand } = loadProfile({ repoRoot: root, env: {} });
    expect(brand.name).toBe("JCI Valle");
    expect(brand.firebase.sites.backstage).toBe("jci-valle-backstage");
    expect(brand.assetsBucket).toBe("jci-valle-brand-assets");
    expect(brand.deploy).toBeUndefined();
    expect(JSON.parse(readFileSync(join(root, ".firebaserc"), "utf8")).projects.default).toBe(
      "jci-valle",
    );
  });

  it("re-connects a connected profile, keeping deploy only for the same project", async () => {
    await init({ repoRoot: root, answers: localAnswers(), local: true, run: noCommands });
    const { firebase } = minimalAnswers() as { firebase: Record<string, unknown> };
    await connect({ repoRoot: root, answers: { firebase }, run: noCommands });
    const file = join(root, "brand/jci-valle/brand.json");
    const withDeploy = JSON.parse(readFileSync(file, "utf8"));
    withDeploy.deploy = {
      workloadIdentityProvider:
        "projects/111222333/locations/global/workloadIdentityPools/github-actions/providers/github-oidc",
      serviceAccount: "firebase-deployer@jci-valle.iam.gserviceaccount.com",
    };
    writeFileSync(file, JSON.stringify(withDeploy));

    await connect({ repoRoot: root, answers: { firebase }, run: noCommands });
    expect(loadProfile({ repoRoot: root, env: {} }).brand.deploy).toEqual(withDeploy.deploy);

    const other = structuredClone(firebase);
    other.projectId = "jci-valle-2";
    await connect({ repoRoot: root, answers: { firebase: other }, run: noCommands });
    const moved = loadProfile({ repoRoot: root, env: {} }).brand;
    expect(moved.firebase.projectId).toBe("jci-valle-2");
    expect(moved.deploy).toBeUndefined();
  });

  it("re-connecting the same project keeps App Check keys a blank answer would erase", async () => {
    await init({ repoRoot: root, answers: localAnswers(), local: true, run: noCommands });
    const { firebase } = minimalAnswers() as { firebase: Record<string, unknown> };
    await connect({ repoRoot: root, answers: { firebase }, run: noCommands });
    const file = join(root, "brand/jci-valle/brand.json");
    const live = JSON.parse(readFileSync(file, "utf8"));
    live.firebase.web.spotlight.appCheckSiteKey = "site-key";
    writeFileSync(file, JSON.stringify(live));
    // Only the project id is answered; every other question falls back.
    const prompter: Prompter = {
      async ask({ key }) {
        return key === "firebase.projectId" ? "jci-valle" : "";
      },
    };
    await connect({ repoRoot: root, prompter, run: noCommands });
    const { web } = loadProfile({ repoRoot: root, env: {} }).brand.firebase;
    expect(web.spotlight.appCheckSiteKey).toBe("site-key");
    expect(web.spotlight.apiKey).toBe("key-spotlight");
  });

  it("re-connecting the same project offers its values as defaults a reply can replace", async () => {
    await init({ repoRoot: root, answers: localAnswers(), local: true, run: noCommands });
    const { firebase } = minimalAnswers() as { firebase: Record<string, unknown> };
    await connect({ repoRoot: root, answers: { firebase }, run: noCommands });
    const offered: Record<string, string | undefined> = {};
    const prompter: Prompter = {
      async ask({ key, fallback }) {
        offered[key] = fallback;
        if (key === "firebase.projectId") return "jci-valle";
        return key === "firebase.web.spotlight.apiKey" ? "new-key" : "";
      },
    };
    await connect({ repoRoot: root, prompter, run: noCommands });
    expect(offered["firebase.web.backstage.apiKey"]).toBe("key-backstage");
    const { web } = loadProfile({ repoRoot: root, env: {} }).brand.firebase;
    expect(web.spotlight.apiKey).toBe("new-key");
    expect(web.backstage.apiKey).toBe("key-backstage");
  });

  it("merges a partial answers file into the profile instead of replacing a section", async () => {
    await init({ repoRoot: root, answers: localAnswers(), local: true, run: noCommands });
    const { firebase } = minimalAnswers() as { firebase: Record<string, unknown> };
    await connect({
      repoRoot: root,
      answers: { firebase, locality: { city: "Quillacollo" } },
      run: noCommands,
    });
    const { locality } = loadProfile({ repoRoot: root, env: {} }).brand;
    expect(locality).toMatchObject({ city: "Quillacollo", country: "Bolivia" });
  });

  it("saves typed project answers when a later step fails", async () => {
    await init({ repoRoot: root, answers: localAnswers(), local: true, run: noCommands });
    const failing: CommandRunner = async () => {
      throw new CommandError("firebase apps:sdkconfig failed: not logged in");
    };
    const replies: Record<string, string> = {
      "firebase.projectId": "jci-valle",
      "firebase.web.spotlight.appId": SPOTLIGHT_APP,
      "firebase.web.backstage.appId": BACKSTAGE_APP,
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
    expect(saved.firebase.projectId).toBe("jci-valle");
  });

  it("asks only the Firebase questions", async () => {
    await init({ repoRoot: root, answers: localAnswers(), local: true, run: noCommands });
    const asked: string[] = [];
    const replies: Record<string, string> = {
      "firebase.projectId": "jci-valle",
      "firebase.web.spotlight.appId": SPOTLIGHT_APP,
      "firebase.web.backstage.appId": BACKSTAGE_APP,
      "firebase.web.spotlight.apiKey": "k1",
      "firebase.web.backstage.apiKey": "k2",
    };
    const prompter: Prompter = {
      async ask({ key }) {
        asked.push(key);
        return replies[key] ?? "";
      },
    };
    await connect({ repoRoot: root, prompter, run: noCommands });
    expect(asked.filter((key) => !key.startsWith("firebase.") && key !== "assetsBucket")).toEqual([
      "fillWeb",
    ]);
  });
});

describe("init guidance", () => {
  it("lists the next steps with their commands", () => {
    const runs = initNext("jci-valle").map(({ change, run }) => run ?? change);
    expect(runs).toEqual([
      "pnpm brand:check",
      expect.stringMatching(/^edit brand\/jci-valle\/site-content\.json/),
      "pnpm dev",
      "git add brand/jci-valle/",
      "pnpm brand:check",
    ]);
    // A local-only profile ends with going live, as a choice, not a deploy.
    const local = initNext("jci-valle", { local: true });
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
    expect(text).toMatch(/^brand:init: wrote brand\/jci-valle\/brand\.json/);
    expect(existsSync(join(root, ANSWERS_FILE))).toBe(false);
  });

  it("starts over when the saved answers are declined, and keeps the file", async () => {
    saveAnswers(minimalAnswers());
    const asked: string[] = [];
    await runInit({ repoRoot: root, prompter: answering({}, asked), run: noCommands }).catch(
      () => undefined,
    );
    expect(asked.map((line) => line.split(":")[0])).toContain("slug");
    expect(existsSync(join(root, ANSWERS_FILE))).toBe(true);
  });

  describe("with a chapter already in brand/", () => {
    beforeEach(async () => {
      await init({ repoRoot: root, answers: localAnswers(), local: true, run: noCommands });
    });

    it("offers to connect a local-only chapter, and changes nothing on a no", async () => {
      const before = readFileSync(join(root, "brand/jci-valle/brand.json"), "utf8");
      const asked: string[] = [];
      const text = await runInit({
        repoRoot: root,
        prompter: answering({}, asked),
        run: noCommands,
      });
      expect(asked).toEqual([
        "connect: brand/jci-valle/ runs on this computer only. Connect it to a Firebase project now? (y/N)",
      ]);
      expect(text).toMatch(/^brand:init: nothing changed/);
      expect(readFileSync(join(root, "brand/jci-valle/brand.json"), "utf8")).toBe(before);
    });

    it("connects it on a yes, and drops declined saved answers once that succeeds", async () => {
      saveAnswers({ firebase: { projectId: "someone-else" } });
      const text = await runInit({
        repoRoot: root,
        prompter: answering({
          useSaved: "n",
          connect: "y",
          "firebase.projectId": "jci-valle",
          "firebase.web.spotlight.appId": SPOTLIGHT_APP,
          "firebase.web.backstage.appId": BACKSTAGE_APP,
          "firebase.web.spotlight.apiKey": "k1",
          "firebase.web.backstage.apiKey": "k2",
        }),
        run: noCommands,
      });
      expect(text).toMatch(/now uses Firebase project jci-valle/);
      expect(loadProfile({ repoRoot: root, env: {} }).localOnly).toBe(false);
      expect(existsSync(join(root, ANSWERS_FILE))).toBe(false);
    });
  });
});
