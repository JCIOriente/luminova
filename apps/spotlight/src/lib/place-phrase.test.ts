import { describe, expect, it } from "vitest";
import { decadesPhrase, withoutArticle, withPreposition } from "./place-phrase";

describe("withPreposition", () => {
  it.each([
    ["de", "el Oriente boliviano", "del Oriente boliviano"],
    ["a", "el Oriente", "al Oriente"],
    ["de", "la Chiquitanía", "de la Chiquitanía"],
    ["a", "Cochabamba", "a Cochabamba"],
    ["de", "Elche", "de Elche"],
  ] as const)("%s + %s → %s", (preposition, phrase, expected) => {
    expect(withPreposition(preposition, phrase)).toBe(expected);
  });
});

describe("withoutArticle", () => {
  it.each([
    ["el Oriente", "Oriente"],
    ["la Chiquitanía", "Chiquitanía"],
    ["los Valles", "Valles"],
    ["Cochabamba", "Cochabamba"],
    ["Elche", "Elche"],
  ])("%s → %s", (phrase, expected) => {
    expect(withoutArticle(phrase)).toBe(expected);
  });
});

describe("decadesPhrase", () => {
  it.each([
    [33, "tres décadas"],
    [40, "cuatro décadas"],
    [19, "una década"],
    [25, "dos décadas"],
    [9, "9 años"],
    [1, "1 año"],
  ])("%d years → %s", (years, expected) => {
    expect(decadesPhrase(years)).toBe(expected);
  });
});
