import { createInterface } from "node:readline/promises";

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

export function terminalPrompter(
  input: NodeJS.ReadableStream = process.stdin,
  output: NodeJS.WritableStream = process.stdout,
): Prompter & { close(): void } {
  const readline = createInterface({ input, output });
  return {
    async ask({ label, fallback, error }) {
      if (error) output.write(`  ${error}\n`);
      return (await readline.question(fallback ? `${label} [${fallback}]: ` : `${label}: `)).trim();
    },
    close: () => readline.close(),
  };
}
