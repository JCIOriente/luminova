export type LocationKind = "virtual" | "physical";

const URLISH = /^(https?:\/\/|www\.)|\b(meet|zoom|teams)\.|\.(com|org|net|io|me|bo|us)\b/i;

/** A location that looks like a URL or meeting link is a virtual venue. */
export function locationKind(location: string): LocationKind {
  return URLISH.test(location.trim()) ? "virtual" : "physical";
}
