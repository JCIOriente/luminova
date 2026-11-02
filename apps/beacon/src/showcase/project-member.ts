import {
  MEMBER_BIO_MAX,
  PROFESSION_MAX_LENGTH,
  genderedTitle,
  isLinkedinProfileUrl,
  type MemberCareerEntry,
  type MemberProjectEntry,
  type MemberProjectRole,
  type MemberShowcaseItem,
} from "@luminova/types/engine";
import { isDeepStrictEqual } from "node:util";
import { hasToMillis, isSafeDocId } from "../firestore-util.js";
import { isMemberPhotoUrl, isPublishableMember, type BoardCargo } from "./project-board.js";

/** Bounds a member-doc-driven read fan-out: one positions/ read per distinct cargo. */
const CAREER_TERM_CAP = 40;
export const MEMBER_PROJECT_CAP = 100;

// Every member field the projection or its gates read. members.totalPoints is rewritten on
// each check-in, so onBoardMemberWritten must tell a relevant edit from that churn.
const MEMBER_PROJECTION_FIELDS = [
  "name",
  "profilePicture",
  "profession",
  "joinDate",
  "bio",
  "linkedinUrl",
  "isPastPresident",
  "gender",
  "positions",
  "publicProfile",
  "uid",
  "active",
  "deletedAt",
  "status",
] as const;

/** True when a member update left every projection-consumed field deep-equal.
 *  Creates and deletes (a missing side) always count as changed. An unpublishable member is
 *  never "unchanged": any later write then heals a takedown whose own event was lost. */
export function memberProjectionUnchanged(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined,
): boolean {
  if (!before || !after || !isPublishableMember(after)) return false;
  return MEMBER_PROJECTION_FIELDS.every((f) => isDeepStrictEqual(before[f], after[f]));
}

function termCargoEntries(member: Record<string, unknown>): [string, string][] {
  const positions = member.positions;
  if (!positions || typeof positions !== "object" || Array.isArray(positions)) return [];
  return Object.entries(positions as Record<string, unknown>)
    .flatMap(([year, term]): [string, string][] => {
      const cargoId = (term as { cargoId?: unknown } | null)?.cargoId;
      return isSafeDocId(cargoId) ? [[year, cargoId]] : [];
    })
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, CAREER_TERM_CAP);
}

/** Distinct, path-safe cargo ids to resolve before projecting. */
export function careerCargoIds(member: Record<string, unknown>): string[] {
  return [...new Set(termCargoEntries(member).map(([, cargoId]) => cargoId))];
}

function projectCareer(
  member: Record<string, unknown>,
  cargos: ReadonlyMap<string, BoardCargo>,
): MemberCareerEntry[] {
  const gender = member.gender === "Femenino" ? "Femenino" : undefined;
  return termCargoEntries(member).flatMap(([year, cargoId]) => {
    const cargo = cargos.get(cargoId);
    const title = typeof cargo?.title === "string" ? cargo.title.trim() : "";
    if (title.length === 0) return [];
    const titleFemale = typeof cargo?.titleFemale === "string" ? cargo.titleFemale : null;
    return [{ year, title: genderedTitle(title, titleFemale, gender) }];
  });
}

/** The fields of a showcase/{id} doc the career projection reads. */
export interface MemberProjectSource {
  id: string;
  title?: unknown;
  endDate?: unknown;
  impact?: unknown;
  team?: unknown;
}

function holdsSeat(person: unknown, memberId: string): boolean {
  return (person as { id?: unknown } | null)?.id === memberId;
}

function projectRole(team: unknown, memberId: string): MemberProjectRole | null {
  const { director, coDirectors, members } = (team ?? {}) as {
    director?: unknown;
    coDirectors?: unknown;
    members?: unknown;
  };
  if (holdsSeat(director, memberId)) return "Director";
  const seated = (people: unknown) =>
    Array.isArray(people) && people.some((p) => holdsSeat(p, memberId));
  if (seated(coDirectors)) return "CoDirector";
  return seated(members) ? "Team" : null;
}

function projectProjects(id: string, sources: MemberProjectSource[]): MemberProjectEntry[] {
  return sources
    .flatMap((source): MemberProjectEntry[] => {
      const role = projectRole(source.team, id);
      if (!role || !hasToMillis(source.endDate)) return [];
      const personsImpacted = (source.impact as { personsImpacted?: unknown } | null)
        ?.personsImpacted;
      return [
        {
          id: source.id,
          title: typeof source.title === "string" ? source.title : "",
          year: new Date(source.endDate.toMillis()).getUTCFullYear(),
          role,
          personsImpacted: typeof personsImpacted === "number" ? personsImpacted : 0,
        },
      ];
    })
    .sort((a, b) => b.year - a.year || a.title.localeCompare(b.title, "es"));
}

/**
 * Project a raw member doc into a curated public MemberShowcaseItem, or null when the
 * member is not publicly showable. Unlike the board there is no cargo or photo gate: this
 * recognizes every member, so a missing photo becomes initials on the page. `bio` and
 * `linkedinUrl` are member-written and rendered on a no-auth page, so they are re-validated
 * here rather than trusted from the form.
 */
export function projectMember(
  id: string,
  member: Record<string, unknown>,
  cargos: ReadonlyMap<string, BoardCargo>,
  projects: MemberProjectSource[],
  projectId: string,
): MemberShowcaseItem | null {
  if (!isPublishableMember(member)) return null;
  const bio = typeof member.bio === "string" ? member.bio.trim() : "";
  const profession = typeof member.profession === "string" ? member.profession.trim() : "";
  return {
    id,
    name: member.name,
    portraitUrl: isMemberPhotoUrl(member.profilePicture, id, projectId)
      ? member.profilePicture
      : null,
    // The rules cap this on the self lane only, and an admin write can reach it here.
    profession:
      profession.length > 0 && profession.length <= PROFESSION_MAX_LENGTH ? profession : null,
    joinYear: hasToMillis(member.joinDate)
      ? new Date(member.joinDate.toMillis()).getUTCFullYear()
      : null,
    bio: bio.length > 0 && bio.length <= MEMBER_BIO_MAX ? bio : null,
    linkedinUrl: isLinkedinProfileUrl(member.linkedinUrl) ? member.linkedinUrl : null,
    isPastPresident: member.isPastPresident === true,
    career: projectCareer(member, cargos),
    projects: projectProjects(id, projects),
  };
}
