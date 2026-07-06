import { useMemo } from "react";
import { useInitiativesOfType } from "./use-initiatives-of-type";
import { tagKind, type InitiativeListItem } from "../lib/initiative-list-item";

export function useInitiativesByTerm(
  termId: string,
  opts: { includePrograms: boolean; includeProjects: boolean },
) {
  const programs = useInitiativesOfType("program", termId, { enabled: opts.includePrograms });
  const projects = useInitiativesOfType("project", termId, { enabled: opts.includeProjects });

  const data = useMemo<InitiativeListItem[] | undefined>(() => {
    if (
      (opts.includePrograms && programs.data === undefined) ||
      (opts.includeProjects && projects.data === undefined)
    ) {
      return undefined;
    }
    return [
      ...tagKind(programs.data ?? [], "Program"),
      ...tagKind(projects.data ?? [], "Project"),
    ].sort((a, b) => a.title.localeCompare(b.title, "es"));
  }, [opts.includePrograms, opts.includeProjects, programs.data, projects.data]);

  return {
    data,
    isLoading:
      (opts.includePrograms && programs.isLoading) || (opts.includeProjects && projects.isLoading),
    isError: programs.isError || projects.isError,
  };
}
