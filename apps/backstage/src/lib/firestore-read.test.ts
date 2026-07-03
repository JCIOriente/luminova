import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { DocParseError, parseDoc, parseDocData, parseDocOrNull, parseDocs } from "./firestore-read";

const schema = z.object({ name: z.string(), points: z.number().default(0) });

function fakeDoc(id: string, data: unknown) {
  return { id, ref: { parent: { id: "members" } }, data: () => data };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("parseDoc", () => {
  it("injects the doc id and applies schema defaults", () => {
    expect(parseDoc(schema, fakeDoc("m1", { name: "Ana" }))).toEqual({
      id: "m1",
      name: "Ana",
      points: 0,
    });
  });

  it("strips fields the schema does not know", () => {
    const row = parseDoc(schema, fakeDoc("m1", { name: "Ana", legacy: true }));
    expect(row).not.toHaveProperty("legacy");
  });

  it("throws DocParseError naming collection and doc on a malformed doc", () => {
    let caught: unknown;
    try {
      parseDoc(schema, fakeDoc("m2", { name: 42 }));
    } catch (error) {
      caught = error;
    }
    if (!(caught instanceof DocParseError)) throw new Error("expected DocParseError");
    expect(caught.collection).toBe("members");
    expect(caught.docId).toBe("m2");
    expect(caught.issues.length).toBeGreaterThan(0);
    expect(caught.message).toContain("members");
    expect(caught.message).toContain("m2");
  });

  it("redacts the failing field value from stored issues (PII must not reach logs)", () => {
    let caught: unknown;
    try {
      parseDoc(schema, fakeDoc("m3", { name: 4242 }));
    } catch (error) {
      caught = error;
    }
    if (!(caught instanceof DocParseError)) throw new Error("expected DocParseError");
    for (const issue of caught.issues) {
      expect(issue).not.toHaveProperty("input");
    }
  });

  it("keeps the document key even if a schema output carries a body id", () => {
    const withId = z.object({ id: z.string(), name: z.string() });
    expect(parseDoc(withId, fakeDoc("real-id", { id: "forged", name: "Ana" })).id).toBe("real-id");
  });
});

describe("parseDocOrNull", () => {
  const existing = (id: string, data: unknown) => ({ ...fakeDoc(id, data), exists: () => true });
  const missing = (id: string) => ({ ...fakeDoc(id, undefined), exists: () => false });

  it("returns null for a missing doc", () => {
    expect(parseDocOrNull(schema, missing("gone"))).toBeNull();
  });

  it("parses an existing doc", () => {
    expect(parseDocOrNull(schema, existing("m1", { name: "Ana" }))).toEqual({
      id: "m1",
      name: "Ana",
      points: 0,
    });
  });
});

describe("parseDocData", () => {
  it("returns parsed fields without id injection", () => {
    expect(parseDocData(schema, fakeDoc("current", { name: "Cfg" }))).toEqual({
      name: "Cfg",
      points: 0,
    });
  });
});

describe("parseDocs", () => {
  it("maps every valid doc with its id", () => {
    const snapshot = {
      docs: [fakeDoc("a", { name: "A" }), fakeDoc("b", { name: "B", points: 3 })],
    };
    expect(parseDocs(schema, snapshot)).toEqual([
      { id: "a", name: "A", points: 0 },
      { id: "b", name: "B", points: 3 },
    ]);
  });

  it("skips malformed docs, logs them, and keeps the rest", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const snapshot = {
      docs: [
        fakeDoc("good", { name: "A" }),
        fakeDoc("bad", {}),
        fakeDoc("also-good", { name: "C" }),
      ],
    };
    const rows = parseDocs(schema, snapshot);
    expect(rows.map((r) => r.id)).toEqual(["good", "also-good"]);
    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0]?.[0]).toContain("members");
    expect(error.mock.calls[0]?.[0]).toContain("bad");
  });
});
