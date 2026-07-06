import { describe, it, expect } from "vitest";
import { initiativeKeys } from "./initiative-keys";

// Guards the classic fold bug: a shared query-key namespace across the two kinds
// makes TanStack prefix-match invalidation of one collection wipe the other's cache.
// RED against any factory that returns an equal / prefix-overlapping key for both kinds.

function isPrefix(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length <= b.length && a.every((seg, i) => b[i] === seg);
}

describe("initiativeKeys — cross-kind query-key isolation", () => {
  it("namespaces each collection under its own key head", () => {
    expect(initiativeKeys("programs").all).toEqual(["programs"]);
    expect(initiativeKeys("projects").all).toEqual(["projects"]);
  });

  it("byTerm keys of the two kinds never collide for the same term", () => {
    const term = "term-2026";
    const programs = initiativeKeys("programs").byTerm(term);
    const projects = initiativeKeys("projects").byTerm(term);

    expect(programs).not.toEqual(projects);
    expect(programs[0]).toBe("programs");
    expect(projects[0]).toBe("projects");
  });

  it("neither kind's byTerm key is a prefix of the other (no cross-kind invalidation)", () => {
    const term = "term-2026";
    const programs = initiativeKeys("programs").byTerm(term);
    const projects = initiativeKeys("projects").byTerm(term);

    expect(isPrefix(programs, projects)).toBe(false);
    expect(isPrefix(projects, programs)).toBe(false);
  });

  it("keeps distinct terms isolated within a kind but shares the collection head", () => {
    const a = initiativeKeys("programs").byTerm("t1");
    const b = initiativeKeys("programs").byTerm("t2");
    expect(a).not.toEqual(b);
    expect(a[0]).toBe(b[0]);
  });
});
