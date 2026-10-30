import { describe, expect, it } from "vitest";
import { CommandError, type CommandRunner } from "./gcloud.ts";
import { UPSTREAM_REPO, forkRepo, parseGitHubRepo } from "./github-repo.ts";

describe("parseGitHubRepo", () => {
  it("reads owner/name from the https and ssh forms git and gh write", () => {
    for (const url of [
      "https://github.com/acme/luminova.git",
      "https://github.com/acme/luminova",
      "https://github.com/acme/luminova/",
      "https://octo@github.com/acme/luminova.git",
      "git@github.com:acme/luminova.git",
      "git@github.com:acme/luminova",
      "ssh://git@github.com/acme/luminova.git",
      "ssh://git@github.com/acme/luminova",
      "  https://github.com/acme/luminova.git\n",
    ]) {
      expect(parseGitHubRepo(url), url).toBe("acme/luminova");
    }
    expect(parseGitHubRepo("git@github.com:JCI-Andina/lumi.nova_2.git")).toBe(
      "JCI-Andina/lumi.nova_2",
    );
  });

  it("is null for anything that is not one github.com repository", () => {
    for (const url of [
      "",
      "https://gitlab.com/acme/luminova.git",
      "https://github.com.evil.org/acme/luminova.git",
      "https://github.com/acme",
      "https://github.com/acme/luminova/tree/main",
      "git@github.com:acme/lu minova.git",
      "/Users/me/luminova",
      "https://github.com/acme/luminova.git\nhttps://github.com/other/repo.git",
    ]) {
      expect(parseGitHubRepo(url), url).toBeNull();
    }
  });
});

describe("forkRepo", () => {
  const calls: string[][] = [];
  /** git answers with the origin URL; gh with GitHub's spelling, or fails. */
  const origin =
    (answer: string | Error, canonical: string | Error = "acme/luminova\n"): CommandRunner =>
    async (command, args) => {
      calls.push([command, ...args]);
      const reply = command === "gh" ? canonical : answer;
      if (reply instanceof Error) throw reply;
      return reply;
    };
  const repoView = (repo: string) => [
    "gh",
    "repo",
    "view",
    repo,
    "--json",
    "nameWithOwner",
    "-q",
    ".nameWithOwner",
  ];

  it("reads the origin remote of the clone, never gh's default repository", async () => {
    calls.length = 0;
    const result = await forkRepo({
      run: origin("git@github.com:acme/luminova.git\n"),
      repoRoot: "/repo",
      projectId: "jci-valle",
    });
    expect(result).toEqual({ repo: "acme/luminova", problem: null });
    expect(calls).toEqual([
      ["git", "-C", "/repo", "remote", "get-url", "origin"],
      repoView("acme/luminova"),
    ]);
  });

  it("takes GitHub's letter case: the keyless sign-in compares owner/name case-sensitively", async () => {
    calls.length = 0;
    const result = await forkRepo({
      run: origin("https://github.com/ACME/Luminova.git\n", "acme/luminova\n"),
      repoRoot: "/repo",
      projectId: "jci-valle",
    });
    expect(result).toEqual({ repo: "acme/luminova", problem: null });
    expect(calls).toContainEqual(repoView("ACME/Luminova"));
  });

  it("keeps origin's spelling, with a note, when gh cannot confirm the case", async () => {
    const note =
      "could not confirm the letter case of ACME/Luminova with gh (gh repo view ACME/Luminova); CD's keyless sign-in matches owner/name case-sensitively, so write it as GitHub does";
    for (const canonical of [
      new CommandError("gh repo view failed: spawn gh ENOENT"),
      new CommandError(
        "gh repo view failed: To get started with GitHub CLI, please run:  gh auth login",
      ),
      "other/repo\n",
      "",
    ]) {
      const result = await forkRepo({
        run: origin("git@github.com:ACME/Luminova.git", canonical),
        repoRoot: "/repo",
        projectId: "jci-valle",
      });
      expect(result, String(canonical)).toEqual({
        repo: "ACME/Luminova",
        problem: null,
        caseNote: note,
      });
    }
  });

  it("names the problem when origin is missing or not on github.com", async () => {
    const missing = await forkRepo({
      run: origin(
        new CommandError("git remote get-url origin failed: error: No such remote 'origin'"),
      ),
      repoRoot: "/repo",
      projectId: "jci-valle",
    });
    expect(missing.repo).toBeNull();
    expect(missing.problem).toMatch(
      /^could not read your fork from the git remote origin.*No such remote/,
    );
    const elsewhere = await forkRepo({
      run: origin("https://gitlab.com/acme/luminova.git\n"),
      repoRoot: "/repo",
      projectId: "jci-valle",
    });
    expect(elsewhere.repo).toBeNull();
    expect(elsewhere.problem).toMatch(/is not a github\.com repository/);
  });

  it("refuses upstream for any chapter but JCI Oriente: an adopter cloned upstream, not a fork", async () => {
    calls.length = 0;
    for (const url of [
      "https://github.com/JCIOriente/luminova.git",
      "git@github.com:jcioriente/Luminova.git",
    ]) {
      const result = await forkRepo({
        run: origin(url),
        repoRoot: "/repo",
        projectId: "jci-valle",
      });
      expect(result.repo).toBeNull();
      expect(result.upstream).toBe(true);
      expect(result.problem).toMatch(
        new RegExp(`^the git remote origin is ${UPSTREAM_REPO}, upstream, not your fork`),
      );
      expect(result.problem).toMatch(/git remote set-url origin/);
    }
    const oriente = await forkRepo({
      run: origin("https://github.com/JCIOriente/luminova.git", `${UPSTREAM_REPO}\n`),
      repoRoot: "/repo",
      projectId: "jci-oriente",
    });
    expect(oriente).toEqual({ repo: UPSTREAM_REPO, problem: null });
    expect(calls.filter(([command]) => command === "gh")).toHaveLength(1);
  });
});
