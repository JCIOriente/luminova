import { describe, expect, it } from "vitest";
import {
  formatISODate,
  formatISODateTime,
  parseISODate,
  parseISODateTime,
} from "./date-picker-utils";

describe("parseISODate", () => {
  it("parses yyyy-MM-dd to a local date at midnight", () => {
    const d = parseISODate("2024-03-15");
    expect(d).toBeInstanceOf(Date);
    expect(d?.getFullYear()).toBe(2024);
    expect(d?.getMonth()).toBe(2);
    expect(d?.getDate()).toBe(15);
    expect(d?.getHours()).toBe(0);
  });
  it("returns undefined for empty, null, undefined, or malformed input", () => {
    expect(parseISODate("")).toBeUndefined();
    expect(parseISODate(null)).toBeUndefined();
    expect(parseISODate(undefined)).toBeUndefined();
    expect(parseISODate("not-a-date")).toBeUndefined();
    expect(parseISODate("2024-13-40")).toBeUndefined();
  });
});

describe("formatISODate", () => {
  it("formats a local date to yyyy-MM-dd without UTC drift", () => {
    expect(formatISODate(new Date(2024, 2, 15))).toBe("2024-03-15");
  });
  it("pads single-digit month and day", () => {
    expect(formatISODate(new Date(2024, 0, 5))).toBe("2024-01-05");
  });
  it("round-trips with parseISODate", () => {
    const iso = "2030-12-31";
    expect(formatISODate(parseISODate(iso)!)).toBe(iso);
  });
});

describe("parseISODateTime", () => {
  it("parses yyyy-MM-ddTHH:mm to a local date", () => {
    const d = parseISODateTime("2024-03-15T14:30");
    expect(d?.getFullYear()).toBe(2024);
    expect(d?.getMonth()).toBe(2);
    expect(d?.getDate()).toBe(15);
    expect(d?.getHours()).toBe(14);
    expect(d?.getMinutes()).toBe(30);
  });
  it("returns undefined for empty, null, undefined, or date-only input", () => {
    expect(parseISODateTime("")).toBeUndefined();
    expect(parseISODateTime(null)).toBeUndefined();
    expect(parseISODateTime(undefined)).toBeUndefined();
    expect(parseISODateTime("2024-03-15")).toBeUndefined();
  });
});

describe("formatISODateTime", () => {
  it("formats a local date to yyyy-MM-ddTHH:mm", () => {
    expect(formatISODateTime(new Date(2024, 2, 15, 14, 30))).toBe("2024-03-15T14:30");
  });
  it("round-trips with parseISODateTime", () => {
    const iso = "2030-12-31T23:59";
    expect(formatISODateTime(parseISODateTime(iso)!)).toBe(iso);
  });
});
