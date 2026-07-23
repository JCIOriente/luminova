import type { MemberGender } from "../member.js";

/** Derive the feminine form: feminize the FIRST word (-o→-a, -e→-a, else +a),
 *  keep the rest. Irregular multi-word titles need an explicit titleFemale. */
export function femaleTitle(title: string): string {
  if (!title) return title;
  const words = title.split(" ");
  const first = words[0] ?? "";
  const rest = words.slice(1);
  let f: string;
  if (/o$/.test(first)) f = first.replace(/o$/, "a");
  else if (/e$/.test(first)) f = first.replace(/e$/, "a");
  else f = first + "a";
  return [f, ...rest].join(" ");
}

/** Gender-aware role title. Femenino → titleFemale (or derived); else the base title. */
export function genderedTitle(
  title: string,
  titleFemale: string | null | undefined,
  gender: MemberGender | undefined,
): string {
  if (gender !== "Femenino") return title;
  return titleFemale ?? femaleTitle(title);
}
