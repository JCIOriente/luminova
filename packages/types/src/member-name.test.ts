import { describe, expect, it } from "vitest";
import { memberName, MEMBER_NAME_MAX_LENGTH, MEMBER_NAME_MIN_LENGTH } from "./member-name.js";

const parse = (value: string) => memberName.safeParse(value);

describe("memberName", () => {
  it.each([
    ["a single given name and surname", "Ana Rivas"],
    ["diacritics and a compound surname", "Ana María Rivas-Paz"],
    ["an apostrophe", "Jean-Luc O'Brien"],
    ["a middle initial", "Ana M. Rivas"],
    ["three given names", "María José Rivas Paz"],
    ["exactly the max length", "a".repeat(MEMBER_NAME_MAX_LENGTH)],
    ["exactly the min length", "a".repeat(MEMBER_NAME_MIN_LENGTH)],
  ])("accepts %s", (_label, value) => {
    expect(parse(value).success).toBe(true);
  });

  // The character class is the security boundary, not a cosmetic nicety: a name that
  // cannot BEGIN with =, +, - or @ cannot be a spreadsheet formula, which is why the
  // members CSV export needs no formula-prefix escape (features/members/lib/member-csv.ts).
  it.each(["=", "+", "-", "@"])("rejects the formula prefix %j", (prefix) => {
    expect(parse(`${prefix}Ana Rivas`).success).toBe(false);
  });

  it.each([
    ["a name below the min length", "Al"],
    ["an empty name", ""],
    ["a whitespace-only name", "   "],
    ["a name over the max length", "a".repeat(MEMBER_NAME_MAX_LENGTH + 1)],
    ["digits", "Ana Rivas 2"],
    ["a comma", "Rivas, Ana"],
    ["a double quote", 'Ana "A" Rivas'],
    ["a semicolon", "Ana; Rivas"],
    ["an ampersand", "Ana & Rivas"],
    ["a separator not followed by a letter", "Ana -Rivas"],
    ["a trailing separator", "Ana Rivas-"],
    ["markup", "<b>Ana</b>"],
  ])("rejects %s", (_label, value) => {
    expect(parse(value).success).toBe(false);
  });

  // Normalization runs BEFORE the bounds, so what a real keyboard produces is repaired
  // rather than rejected. firestore.rules has no normalizer — it sees only what the form
  // already cleaned — so these raw forms are denied server-side by design.
  it.each([
    ["collapses and trims whitespace", "  Ana   Rivas ", "Ana Rivas"],
    ["folds a typographic apostrophe", "Ana O’Brien", "Ana O'Brien"],
    ["composes NFD accents", "Aña Rivas", "Aña Rivas"],
    ["folds a non-breaking space", "Ana Rivas", "Ana Rivas"],
    // Control characters are \s, so they are repaired here rather than rejected — the
    // stored value still starts with a letter, so nothing reaches the CSV. The raw forms
    // are denied in firestore.rules, which never sees a normalizer.
    ["repairs a leading tab", "\tAna Rivas", "Ana Rivas"],
    ["repairs an embedded newline", "Ana\nRivas", "Ana Rivas"],
    ["repairs a trailing carriage return", "Ana Rivas\r", "Ana Rivas"],
  ])("%s", (_label, input, expected) => {
    const result = parse(input);
    expect(result.success).toBe(true);
    expect(result.success && result.data).toBe(expected);
  });

  it("counts the max length after normalization, not before", () => {
    expect(parse(`  ${"a".repeat(MEMBER_NAME_MAX_LENGTH)}  `).success).toBe(true);
  });
});
