/**
 * What to do about a problem, or what comes next: the change to make (a file to edit, a
 * folder to fill), the command to run, and where. Every brand command prints these so an
 * adopter can follow docs/adopting.md from the terminal alone.
 */
export interface Remedy {
  change?: string;
  run?: string;
  /** `repo` (the default for a command), `shell`, or a console such as `GitHub`. */
  where?: string;
}

export interface Problem {
  message: string;
  remedy?: Remedy;
}

const PLACES: Readonly<Record<string, string>> = { repo: "the repo", shell: "your shell" };

function place(remedy: Remedy): string {
  const where = remedy.where ?? (remedy.run ? "repo" : undefined);
  return where ? `   # in ${PLACES[where] ?? `the ${where}`}` : "";
}

const key = ({ change, run, where }: Remedy) => JSON.stringify([change, run, where]);

export function uniqueRemedies(remedies: readonly (Remedy | undefined)[]): Remedy[] {
  const seen = new Set<string>();
  return remedies.filter((remedy): remedy is Remedy => {
    if (!remedy || seen.has(key(remedy))) return false;
    seen.add(key(remedy));
    return true;
  });
}

function remedyLines(remedy: Remedy, indent: string): string[] {
  if (!remedy.change) return [`${indent}${remedy.run ?? ""}${place(remedy)}`];
  if (!remedy.run) return [`${indent}${remedy.change}${place(remedy)}`];
  const under = " ".repeat(indent.length + 2);
  return [`${indent}${remedy.change}`, `${under}${remedy.run}${place(remedy)}`];
}

/** A "To fix:" block, each remedy once in first-seen order; "" when there are none. */
export function formatRemedies(remedies: readonly (Remedy | undefined)[]): string {
  const unique = uniqueRemedies(remedies);
  if (unique.length === 0) return "";
  return ["To fix:", ...unique.flatMap((remedy) => remedyLines(remedy, "  - "))].join("\n");
}

export function formatNext(next: Remedy): string {
  const [first = "", ...rest] = next.change
    ? [next.change, `${next.run ?? ""}${place(next)}`]
    : [`${next.run ?? ""}${place(next)}`];
  return [`Next: ${first}`, ...rest.filter(Boolean).map((line) => `  ${line}`)].join("\n");
}
