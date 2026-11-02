/** Below this, wrapped details are harder to read than a table wider than the window. */
const MIN_LAST_COLUMN = 16;

/** Greedy word wrap; a word longer than the column (a URL, an email) breaks. */
export function wrapText(text: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && line.length + 1 + word.length <= width) {
      line += ` ${word}`;
      continue;
    }
    if (line) lines.push(line);
    let rest = word;
    while (rest.length > width) {
      lines.push(rest.slice(0, width));
      rest = rest.slice(width);
    }
    line = rest;
  }
  lines.push(line);
  return lines;
}

/** Natural column widths; when they overflow `maxWidth`, only the last column gives way. */
export function columnWidths(rows: readonly (readonly string[])[], maxWidth: number): number[] {
  const widths = (rows[0] ?? []).map((_, column) =>
    Math.max(...rows.map((row) => (row[column] ?? "").length)),
  );
  const last = widths.length - 1;
  const others = widths.slice(0, last).reduce((sum, width) => sum + width, 0);
  const borders = 3 * widths.length + 1;
  widths[last] = Math.min(
    widths[last] ?? 0,
    Math.max(MIN_LAST_COLUMN, maxWidth - others - borders),
  );
  return widths;
}

const rule = (widths: readonly number[], [left, middle, right]: string) =>
  `${left}${widths.map((width) => "─".repeat(width + 2)).join(middle)}${right}`;

function rowLines(row: readonly string[], widths: readonly number[]): string[] {
  const cells = row.map((cell, column) => wrapText(cell, widths[column] ?? 0));
  const height = Math.max(...cells.map((lines) => lines.length));
  return Array.from({ length: height }, (_, index) => {
    const line = cells.map((lines, column) => (lines[index] ?? "").padEnd(widths[column] ?? 0));
    return `│ ${line.join(" │ ")} │`;
  });
}

/** A bordered table: the first row is the header. */
export function formatBox(rows: readonly (readonly string[])[], widths: readonly number[]): string {
  const [header = [], ...body] = rows;
  return [
    rule(widths, "┌┬┐"),
    ...rowLines(header, widths),
    rule(widths, "├┼┤"),
    ...body.flatMap((row) => rowLines(row, widths)),
    rule(widths, "└┴┘"),
  ].join("\n");
}

const MAX_WIDTH = 120;
const NO_WINDOW_WIDTH = 100;

/** The window's width, capped so a wide screen keeps lines readable; a pipe has no window. */
export const terminalWidth = (): number =>
  Math.min(process.stdout.columns || process.stderr.columns || NO_WINDOW_WIDTH, MAX_WIDTH);

export const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
