import type { ProjectInput } from "@luminova/types";

export function toProjectCreateDoc(data: ProjectInput, termId: string) {
  return {
    termId,
    title: data.title,
    roster: data.roster,
    status: data.status,
    finalReport: null,
  };
}

export function toProjectUpdateDoc(data: ProjectInput) {
  return {
    title: data.title,
    roster: data.roster,
    status: data.status,
  };
}
