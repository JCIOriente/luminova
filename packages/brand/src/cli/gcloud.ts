import { execFile } from "node:child_process";
import type { Remedy } from "../remedy.ts";

/**
 * The one seam to external CLIs (`gcloud`, `gh`, `firebase`, `pnpm`). Argument arrays only, never a shell
 * string, so no value from a profile or the bucket can be interpreted by a shell. Tests
 * inject a fake that records argv.
 */
export type CommandRunner = (
  command: "gcloud" | "gh" | "firebase" | "pnpm",
  args: readonly string[],
) => Promise<string>;

type Command = Parameters<CommandRunner>[0];

/** What a failure was, when stderr says so; callers branch on it instead of re-reading text. */
export type CommandFailureKind = "notInstalled" | "signIn" | "denied" | "notFound" | "other";

export class CommandError extends Error {
  override name = "CommandError";
  readonly remedies: readonly Remedy[];
  readonly kind: CommandFailureKind;

  constructor(
    message: string,
    remedies: readonly Remedy[] = [],
    kind: CommandFailureKind = "other",
  ) {
    super(message);
    this.remedies = remedies;
    this.kind = kind;
  }
}

export const INSTALL_FIREBASE_CLI: Remedy = {
  change: "install or update the Firebase CLI (CI pins 15.22.1)",
  run: "npm install -g firebase-tools@15.22.1",
  where: "shell",
};

const INSTALL: Readonly<Record<Command, Remedy>> = {
  gcloud: { change: "install the Google Cloud CLI: https://cloud.google.com/sdk/docs/install" },
  gh: { change: "install the GitHub CLI: https://cli.github.com" },
  firebase: INSTALL_FIREBASE_CLI,
  pnpm: { change: "enable pnpm", run: "corepack enable", where: "shell" },
};

const SIGN_IN: Readonly<Partial<Record<Command, { pattern: RegExp; remedy: Remedy }>>> = {
  gcloud: {
    pattern: /auth login|no credentialed accounts|reauthenticat|active account/i,
    remedy: { run: "gcloud auth login", where: "shell" },
  },
  gh: { pattern: /gh auth login|not logged in/i, remedy: { run: "gh auth login", where: "shell" } },
  firebase: {
    pattern: /firebase login|not logged in|failed to authenticate/i,
    remedy: { run: "firebase login", where: "shell" },
  },
};

/** A failed external command, with what to do when the cause is recognisable. */
export function commandFailure(
  command: Command,
  args: readonly string[],
  {
    code,
    stderr,
    message = "",
  }: { code?: string | number | null; stderr: string; message?: string },
): CommandError {
  const text = `${command} ${args.join(" ")} failed: ${stderr.trim() || message}`;
  if (code === "ENOENT") {
    return new CommandError(
      `${text} (${command} is not installed)`,
      [INSTALL[command]],
      "notInstalled",
    );
  }
  const signIn = SIGN_IN[command];
  if (signIn?.pattern.test(stderr)) return new CommandError(text, [signIn.remedy], "signIn");
  if (command !== "gcloud") return new CommandError(text);
  if (/\b403\b|AccessDenied|does not have .*permission/i.test(stderr)) {
    return new CommandError(
      text,
      [
        {
          change: "sign in with an account that has access to the project (its owner)",
          run: "gcloud auth login",
          where: "shell",
        },
      ],
      "denied",
    );
  }
  if (/\b404\b|not found/i.test(stderr)) return new CommandError(text, [], "notFound");
  return new CommandError(text);
}

export const runCommand: CommandRunner = (command, args) =>
  new Promise((resolve, reject) => {
    execFile(command, [...args], { maxBuffer: 32 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(commandFailure(command, args, { code: error.code, stderr, message: error.message }));
      } else {
        resolve(stdout);
      }
    });
  });

/** For printing a command the owner runs; never executed through a shell. */
export function shellQuote(arg: string): string {
  return /^[\w@%+=:,./-]+$/.test(arg) ? arg : `'${arg.replaceAll("'", `'\\''`)}'`;
}

/** `gs://<bucket>` alone, or `gs://<bucket>/<path>` (a trailing `/` path names a folder). */
export function bucketUrl(bucket: string, path?: string): string {
  return path === undefined ? `gs://${bucket}` : `gs://${bucket}/${path}`;
}
