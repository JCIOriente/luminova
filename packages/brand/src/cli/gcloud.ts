import { execFile } from "node:child_process";
import type { Remedy } from "../remedy.ts";
import { installRemedy } from "./install.ts";

/**
 * The one seam to external CLIs (`gcloud`, `gh`, `firebase`, `pnpm`, `java`). Argument arrays only, never a shell
 * string, so no value from a profile or the bucket can be interpreted by a shell. Tests
 * inject a fake that records argv.
 */
export type CommandRunner = (
  command: "gcloud" | "gh" | "firebase" | "pnpm" | "java",
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

export const SIGN_IN_REMEDY = {
  gcloud: { run: "gcloud auth login", where: "shell" },
  gh: { run: "gh auth login", where: "shell" },
  firebase: { run: "firebase login", where: "shell" },
} as const satisfies Readonly<Partial<Record<Command, Remedy>>>;

const SIGN_IN: Readonly<Partial<Record<Command, { pattern: RegExp; remedy: Remedy }>>> = {
  gcloud: {
    pattern: /auth login|no credentialed accounts|reauthenticat|active account/i,
    remedy: SIGN_IN_REMEDY.gcloud,
  },
  gh: { pattern: /gh auth login|not logged in/i, remedy: SIGN_IN_REMEDY.gh },
  firebase: {
    pattern: /firebase login|not logged in|failed to authenticate/i,
    remedy: SIGN_IN_REMEDY.firebase,
  },
};

/** A CLI that is on PATH but says it is missing: macOS's /usr/bin/java stub. */
const NOT_INSTALLED: Readonly<Partial<Record<Command, RegExp>>> = {
  java: /Unable to locate a Java Runtime/,
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
  if (code === "ENOENT" || NOT_INSTALLED[command]?.test(stderr)) {
    return new CommandError(
      `${text} (${command} is not installed)`,
      [installRemedy(command)],
      "notInstalled",
    );
  }
  // gh auth login cannot replace a token the shell exports; it has to go first.
  const badToken =
    command === "gh"
      ? /The token in (GH_TOKEN|GITHUB_TOKEN) is invalid/.exec(stderr)?.[1]
      : undefined;
  if (badToken) {
    return new CommandError(
      text,
      [
        {
          change: `${badToken} holds an invalid token: unset it`,
          run: `unset ${badToken}`,
          where: "shell",
        },
        SIGN_IN_REMEDY.gh,
      ],
      "signIn",
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
          ...SIGN_IN_REMEDY.gcloud,
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
