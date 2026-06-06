import type { ComboboxOption } from "./combobox";

export function toggleValue(values: string[], v: string): string[] {
  return values.includes(v) ? values.filter((x) => x !== v) : [...values, v];
}

export function removeValue(values: string[], v: string): string[] {
  return values.filter((x) => x !== v);
}

export function selectedOptions(options: ComboboxOption[], values: string[]): ComboboxOption[] {
  return options.filter((o) => values.includes(o.value));
}
