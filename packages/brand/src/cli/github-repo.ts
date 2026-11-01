import { CommandError, type CommandRunner } from "./gcloud.ts";

/** The repository every chapter forks; only JCI Oriente deploys from it. */
export const UPSTREAM_REPO = "JCIOriente/luminova";
const UPSTREAM_PROJECT = "jci-oriente";

const ORIGIN_COMMAND = "git remote get-url origin";

/** Where the fork's owner/name comes from, for a hint next to a value to fill in. */
export const FORK_HINT = `${ORIGIN_COMMAND} (your fork, as owner/name)`;

const OWNER = "[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})";
const NAME = "[A-Za-z0-9._-]+?";
const GITHUB_URL = new RegExp(
  `^(?:https://(?:[^@/\\s]+@)?github\\.com/|ssh://git@github\\.com/|git@github\\.com:)(${OWNER})/(${NAME})(?:\\.git)?/?$`,
);

/** owner/name of a github.com remote URL (https or ssh), or null for anything else. */
export function parseGitHubRepo(url: string): string | null {
  const match = GITHUB_URL.exec(url.trim());
  return match ? `${match[1]}/${match[2]}` : null;
}

/** The fork, or why it is not known; `caseNote` when GitHub's letter case went unconfirmed. */
export interface ForkLookup {
  repo: string | null;
  problem: string | null;
  upstream?: true;
  caseNote?: string;
}

const caseNote = (repo: string) =>
  `could not confirm the letter case of ${repo} with gh (gh repo view ${repo}); CD's keyless sign-in matches owner/name case-sensitively, so write it as GitHub does`;

/**
 * GitHub's spelling of owner/name: origin keeps whatever case the URL was typed in, while the
 * OIDC claims CD's attribute condition compares (case-sensitively) carry GitHub's. When gh is
 * missing, signed out or answers with another repository, origin's spelling and a note.
 */
async function canonicalCase(
  run: CommandRunner,
  repo: string,
): Promise<{ repo: string; caseNote?: string }> {
  try {
    const answer = (
      await run("gh", ["repo", "view", repo, "--json", "nameWithOwner", "-q", ".nameWithOwner"])
    ).trim();
    if (answer.toLowerCase() === repo.toLowerCase()) return { repo: answer };
  } catch (error) {
    if (!(error instanceof CommandError)) throw error;
    // Surfaced as the note below: an unconfirmed case is not a reason to stop.
  }
  return { repo, caseNote: caseNote(repo) };
}

/**
 * The fork CD runs in, read from the clone's `origin` remote. Not gh's default repository: in
 * a clone made with `gh repo fork --clone` (or a `gh repo clone` of a fork) that is the
 * `upstream` remote, JCIOriente/luminova, so every gh call names this one with --repo. Null,
 * with the reason, when origin is missing, not on github.com, or upstream itself for any
 * chapter but JCI Oriente. `caseNote` says when GitHub's letter case could not be confirmed.
 */
export async function forkRepo({
  run,
  repoRoot,
  projectId,
}: {
  run: CommandRunner;
  repoRoot: string;
  projectId: string;
}): Promise<ForkLookup> {
  let url: string;
  try {
    url = await run("git", ["-C", repoRoot, "remote", "get-url", "origin"]);
  } catch (error) {
    if (!(error instanceof CommandError)) throw error;
    return {
      repo: null,
      problem: `could not read your fork from the git remote origin (${ORIGIN_COMMAND}): ${error.message}`,
    };
  }
  const repo = parseGitHubRepo(url);
  if (!repo) {
    return {
      repo: null,
      problem: `could not read your fork from the git remote origin: ${url.trim()} is not a github.com repository`,
    };
  }
  if (repo.toLowerCase() === UPSTREAM_REPO.toLowerCase() && projectId !== UPSTREAM_PROJECT) {
    return {
      repo: null,
      upstream: true,
      problem: `the git remote origin is ${UPSTREAM_REPO}, upstream, not your fork, but ${projectId} is not JCI Oriente's project: point origin at your fork (git remote set-url origin <your fork's URL>), or clone your fork (gh repo fork ${UPSTREAM_REPO} --clone)`,
    };
  }
  return { ...(await canonicalCase(run, repo)), problem: null };
}
