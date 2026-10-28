import { once } from "node:events";
import { createInterface, type Interface } from "node:readline/promises";
import { CommandError } from "./gcloud.ts";

/**
 * The reply, or null when the input closes first (Ctrl-D, or Ctrl-C, which closes readline):
 * a pending question would otherwise never settle, and Node exits 13 mid-await.
 */
async function reply(readline: Interface, prompt: string): Promise<string | null> {
  const closed = once(readline, "close").then(() => null);
  const answered = readline.question(prompt).catch(() => null);
  return Promise.race([answered, closed]);
}

export interface Question {
  /** Dotted brand.json path, or a flag name such as `fillWeb`. */
  key: string;
  label: string;
  fallback?: string;
  /** Why the previous reply was refused. */
  error?: string;
}

export interface Prompter {
  /** The trimmed reply; the caller treats "" as "use the fallback". */
  ask(question: Question): Promise<string>;
}

/** A yes/no reply: only y or yes (any case) is yes; anything else, blank included, is no. */
export const isYes = (reply: string) => /^y(es)?$/i.test(reply.trim());

/** A yes/no question whose default is no. */
export type Confirm = (question: string) => Promise<boolean>;

/**
 * Asks on the terminal; undefined without one (a script, CI), so a command never waits for
 * an answer nobody can give and does its safe default instead.
 */
export function terminalConfirm(
  input: NodeJS.ReadStream = process.stdin,
  output: NodeJS.WritableStream = process.stdout,
): Confirm | undefined {
  if (!input.isTTY) return undefined;
  return async (question) => {
    const readline = createInterface({ input, output });
    try {
      return isYes((await reply(readline, `${question} (y/N) `)) ?? "");
    } finally {
      readline.close();
    }
  };
}

export function terminalPrompter(
  input: NodeJS.ReadableStream = process.stdin,
  output: NodeJS.WritableStream = process.stdout,
): Prompter & { close(): void } {
  const readline = createInterface({ input, output });
  return {
    async ask({ label, fallback, error }) {
      if (error) output.write(`  ${error}\n`);
      const text = await reply(readline, fallback ? `${label} [${fallback}]: ` : `${label}: `);
      if (text === null) throw new CommandError("Stopped before every question was answered.");
      return text.trim();
    },
    close: () => readline.close(),
  };
}
