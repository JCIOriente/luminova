import { describe, expect, it } from "vitest";
import {
  memberName,
  memberNameOrUnchanged,
  MEMBER_NAME_MAX_LENGTH,
  MEMBER_NAME_MIN_LENGTH,
} from "./member-name.js";

const parse = (value: string) => memberName.safeParse(value);

describe("memberName", () => {
  it.each([
    ["a single given name and surname", "Ana Rivas"],
    ["diacritics and a compound surname", "Ana María Rivas-Paz"],
    ["an apostrophe", "Jean-Luc O'Brien"],
    ["a middle initial", "Ana M. Rivas"],
    ["three given names", "María José Rivas Paz"],
    ["a Croatian surname (Latin Extended-A)", "Zvonko Matković"],
    ["a Polish surname", "Łukasz Nowak"],
    ["a Czech surname", "Ludmila Šimková"],
    ["exactly the max length", "a".repeat(MEMBER_NAME_MAX_LENGTH)],
    ["exactly the min length", "a".repeat(MEMBER_NAME_MIN_LENGTH)],
  ])("accepts %s", (_label, value) => {
    expect(parse(value).success).toBe(true);
  });

  // A name can never BEGIN with =, +, - or @. That is a property of the identity field,
  // not the CSV defense — member-csv.ts escapes formula prefixes at the output boundary
  // because it must also cover legacy names and the Correo/Cargo columns.
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
    ["folds a typographic apostrophe", "Ana O\u2019Brien", "Ana O'Brien"],
    ["composes NFD accents", "An\u0303a Rivas", "A\u00f1a Rivas"],
    ["folds a non-breaking space", "Ana\u00a0Rivas", "Ana Rivas"],
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

// The client mirror of touched('name') in firestore.rules. Without it a member enrolled
// before memberNameValid() existed cannot save ANY field, because React Hook Form validates
// the whole schema against defaultValues seeded from the stored doc.
describe("memberNameOrUnchanged", () => {
  const LEGACY = "Ana Rivas 2";
  const schema = memberNameOrUnchanged(LEGACY);

  it("accepts the stored name verbatim even though the pattern rejects it", () => {
    const result = schema.safeParse(LEGACY);
    expect(result.success).toBe(true);
    // Verbatim, not normalized — the rules must see no diff at all on this key.
    expect(result.success && result.data).toBe(LEGACY);
  });

  it("still rejects a DIFFERENT invalid name", () => {
    expect(schema.safeParse("Ana Rivas 3").success).toBe(false);
  });

  it("accepts a repair to a valid name, normalized", () => {
    const result = schema.safeParse("  Ana   Rivas ");
    expect(result.success).toBe(true);
    expect(result.success && result.data).toBe("Ana Rivas");
  });

  it("validates normally when the stored name is already valid", () => {
    const strict = memberNameOrUnchanged("Ana Rivas");
    expect(strict.safeParse("Ana Rivas 2").success).toBe(false);
    expect(strict.safeParse("Ana Rivas").success).toBe(true);
  });
});
