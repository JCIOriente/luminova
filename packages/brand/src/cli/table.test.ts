import { describe, expect, it } from "vitest";
import { columnWidths, formatBox, plural, wrapText } from "./table.ts";

describe("wrapText", () => {
  it("breaks at spaces", () => {
    expect(wrapText("all files are in the bucket", 12)).toEqual([
      "all files",
      "are in the",
      "bucket",
    ]);
  });

  it("breaks a word longer than the column", () => {
    expect(wrapText("gs://a-very-long-bucket", 10)).toEqual(["gs://a-ver", "y-long-buc", "ket"]);
  });

  it("keeps an empty cell one line tall", () => {
    expect(wrapText("", 10)).toEqual([""]);
  });
});

describe("columnWidths", () => {
  const rows = [
    ["Tools", "Status", "Details"],
    ["node", "✓ OK", "a detail of forty characters, more or so"],
  ];

  it("keeps natural widths when they fit", () => {
    expect(columnWidths(rows, 100)).toEqual([5, 6, 40]);
  });

  it("takes the shortage from the last column only", () => {
    expect(columnWidths(rows, 40)).toEqual([5, 6, 19]);
  });

  it("keeps the last column readable in a very narrow window", () => {
    expect(columnWidths(rows, 20)).toEqual([5, 6, 16]);
  });
});

describe("formatBox", () => {
  it("draws a header, a rule and wrapped rows, every line the same width", () => {
    const lines = formatBox(
      [
        ["Tools", "Status", "Details"],
        ["node", "✓ OK", "one two three"],
      ],
      [5, 6, 7],
    ).split("\n");
    expect(lines).toEqual([
      "┌───────┬────────┬─────────┐",
      "│ Tools │ Status │ Details │",
      "├───────┼────────┼─────────┤",
      "│ node  │ ✓ OK   │ one two │",
      "│       │        │ three   │",
      "└───────┴────────┴─────────┘",
    ]);
  });
});

describe("plural", () => {
  it("adds an s except for one", () => {
    expect(plural(1, "note")).toBe("1 note");
    expect(plural(2, "note")).toBe("2 notes");
  });
});
