import type { ProgramInput } from "@luminova/types";

export function toProgramCreateDoc(data: ProgramInput, termId: string) {
  return {
    termId,
    title: data.title,
    roster: data.roster,
    status: data.status,
    finalReport: null,
  };
}

export function toProgramUpdateDoc(data: ProgramInput) {
  return {
    title: data.title,
    roster: data.roster,
    status: data.status,
  };
}
