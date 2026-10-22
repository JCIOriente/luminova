export function withPreposition(preposition: "de" | "a", phrase: string): string {
  return phrase.startsWith("el ")
    ? `${preposition === "de" ? "del" : "al"} ${phrase.slice(3)}`
    : `${preposition} ${phrase}`;
}

export function withoutArticle(phrase: string): string {
  return phrase.replace(/^(el|la|los|las) /, "");
}

const DECADE_WORDS = ["una", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve"];

export function decadesPhrase(years: number): string {
  const decades = Math.floor(years / 10);
  if (decades < 1) return `${years} ${years === 1 ? "año" : "años"}`;
  const word = DECADE_WORDS[decades - 1] ?? String(decades);
  return `${word} ${decades === 1 ? "década" : "décadas"}`;
}
