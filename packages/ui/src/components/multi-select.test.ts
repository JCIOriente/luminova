import { describe, expect, it } from "vitest";
import { removeValue, selectedOptions, toggleValue } from "./multi-select";
import type { ComboboxOption } from "./combobox";

const OPTS: ComboboxOption[] = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Beta" },
  { value: "c", label: "Gamma" },
];

describe("toggleValue", () => {
  it("adds an absent value", () => {
    expect(toggleValue(["a"], "b")).toEqual(["a", "b"]);
  });
  it("removes a present value", () => {
    expect(toggleValue(["a", "b"], "a")).toEqual(["b"]);
  });
});

describe("removeValue", () => {
  it("drops the value, leaving the rest in order", () => {
    expect(removeValue(["a", "b", "c"], "b")).toEqual(["a", "c"]);
  });
  it("is a no-op when absent", () => {
    expect(removeValue(["a"], "z")).toEqual(["a"]);
  });
});

describe("selectedOptions", () => {
  it("returns the option objects for the selected values, in options order", () => {
    expect(selectedOptions(OPTS, ["c", "a"]).map((o) => o.value)).toEqual(["a", "c"]);
  });
  it("returns empty for no selection", () => {
    expect(selectedOptions(OPTS, [])).toEqual([]);
  });
});
