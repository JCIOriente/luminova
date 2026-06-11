import type { Program } from "@luminova/types";
import type { Project } from "@luminova/types";
import { ProgramRepository } from "../../programs/repositories/program-repository";
import { ProjectRepository } from "../../projects/repositories/project-repository";
import { tagKind, type InitiativeListItem } from "../lib/initiative-list-item";

export class InitiativeRepository {
  async getByTerm(
    termId: string,
    opts: { includePrograms: boolean; includeProjects: boolean },
  ): Promise<InitiativeListItem[]> {
    const [programs, projects] = await Promise.all([
      opts.includePrograms
        ? new ProgramRepository().getByTerm(termId)
        : Promise.resolve([] as Program[]),
      opts.includeProjects
        ? new ProjectRepository().getByTerm(termId)
        : Promise.resolve([] as Project[]),
    ]);
    return [...tagKind(programs, "Program"), ...tagKind(projects, "Project")].sort((a, b) =>
      a.title.localeCompare(b.title, "es"),
    );
  }
}
