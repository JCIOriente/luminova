import { execFile } from "node:child_process";

/**
 * The one seam to external CLIs (`gcloud`, `gh`). Argument arrays only, never a shell
 * string, so no value from a profile or the bucket can be interpreted by a shell. Tests
 * inject a fake that records argv.
 */
export type CommandRunner = (command: "gcloud" | "gh", args: readonly string[]) => Promise<string>;

export class CommandError extends Error {
  override name = "CommandError";
}

export const runCommand: CommandRunner = (command, args) =>
  new Promise((resolve, reject) => {
    execFile(command, [...args], { maxBuffer: 32 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(
          new CommandError(
            `${command} ${args.join(" ")} failed: ${stderr.trim() || error.message}`,
          ),
        );
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
