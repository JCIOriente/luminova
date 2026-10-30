/**
 * What to do about a problem, or what comes next: the change to make (a file to edit, a
 * folder to fill), the command to run, and where. Every brand command prints these so an
 * adopter can follow docs/adopting.md from the terminal alone.
 */
export interface Remedy {
  change?: string;
  run?: string;
  /** Where `run` goes; a command defaults to the repo. */
  where?: "repo" | "shell";
  /** A web page to do `change` on, e.g. `Firebase console → Project settings`. */
  console?: string;
}

/** The docs/adopting.md steps the CLI points at; a test checks each heading still matches. */
export const GUIDE_STEPS = {
  example: 1,
  profile: 2,
  images: 3,
  firebaseProject: 6,
  connect: 7,
  check: 8,
  provision: 9,
  goLive: 12,
} as const;

export const guideStep = (step: keyof typeof GUIDE_STEPS) =>
  `docs/adopting.md step ${GUIDE_STEPS[step]}`;

export interface Problem {
  message: string;
  remedies?: readonly Remedy[];
}

const PLACES = { repo: "the repo root", shell: "your shell" } as const;

function place({ where, console, run }: Remedy): string {
  if (console) return `   # in the ${console}`;
  const at = where ?? (run ? "repo" : undefined);
  return at ? `   # in ${PLACES[at]}` : "";
}

const key = ({ change, run, where, console }: Remedy) =>
  JSON.stringify([change, run, where, console]);

export function uniqueRemedies(remedies: readonly Remedy[]): Remedy[] {
  const seen = new Set<string>();
  return remedies.filter((remedy) => {
    if (seen.has(key(remedy))) return false;
    seen.add(key(remedy));
    return true;
  });
}

/** The change, then the command indented under it; the place goes on the last line. */
function remedyLines(remedy: Remedy, marker: string): string[] {
  const text = [remedy.change, remedy.run].filter((line): line is string => Boolean(line));
  const under = " ".repeat(marker.length + 2);
  return text.map(
    (line, index) =>
      `${index === 0 ? marker : under}${line}${index === text.length - 1 ? place(remedy) : ""}`,
  );
}

/** A "To fix:" block, each remedy once in first-seen order; "" when there are none. */
export function formatRemedies(remedies: readonly Remedy[]): string {
  const unique = uniqueRemedies(remedies);
  if (unique.length === 0) return "";
  return ["To fix:", ...unique.flatMap((remedy) => remedyLines(remedy, "  - "))].join("\n");
}

/** The next step as commands to paste; several steps are numbered. */
export function formatNext(steps: readonly Remedy[]): string {
  const marker = (index: number) => (steps.length === 1 ? "  " : `  ${index + 1}. `);
  return ["Next:", ...steps.flatMap((step, index) => remedyLines(step, marker(index)))].join("\n");
}
