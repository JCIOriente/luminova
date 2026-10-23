/** Left-aligned columns separated by two spaces; the last column is never padded. */
export function formatTable(rows: readonly (readonly string[])[]): string {
  const widths = rows[0]?.map((_, column) =>
    Math.max(...rows.map((row) => (row[column] ?? "").length)),
  );
  return rows
    .map((row) =>
      row
        .map((cell, column) =>
          column === row.length - 1 ? cell : cell.padEnd(widths?.[column] ?? 0),
        )
        .join("  "),
    )
    .join("\n");
}
