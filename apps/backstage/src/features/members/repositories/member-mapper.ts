import { Timestamp } from "firebase/firestore";
import { currentTermKey, type MemberInput, type TermPositions } from "@luminova/types";

function toTimestamp(dateString: string): Timestamp {
  // UTC midnight so a date-only value is stored consistently regardless of the
  // runtime timezone (date round-trips with dateInputValue's UTC parts).
  return Timestamp.fromDate(new Date(`${dateString}T00:00:00Z`));
}

/** Format a Firestore Timestamp as a `YYYY-MM-DD` string for date inputs. */
export function dateInputValue(timestamp: Timestamp): string {
  const date = timestamp.toDate();
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Editable fields shared by create and update. */
function editableFields(data: MemberInput) {
  return {
    name: data.name,
    email: data.email,
    phone: data.phone ?? "",
    gender: data.gender,
    profession: data.profession ?? "",
    joinDate: toTimestamp(data.joinDate),
    birthdate: toTimestamp(data.birthdate),
    status: data.status,
  };
}

/** New member document: editable fields + system defaults. */
export function toMemberCreateDoc(
  data: MemberInput,
  assignedBy: string,
  termKey = currentTermKey(),
) {
  return {
    ...editableFields(data),
    positions: {
      [termKey]: { cargoId: data.cargoId, comisionIds: data.comisionIds, assignedBy },
    },
    profilePicture: null,
    totalPoints: 0,
    active: true,
    deletedAt: null,
  };
}

type EditableFields = ReturnType<typeof editableFields>;
type UpdateDoc = EditableFields & Partial<Record<`positions.${string}`, TermPositions>>;

function sameAssignment(
  current: Pick<TermPositions, "cargoId" | "comisionIds"> | null | undefined,
  next: Pick<TermPositions, "cargoId" | "comisionIds">,
): boolean {
  if (!current) return false;
  if ((current.cargoId ?? null) !== (next.cargoId ?? null)) return false;
  const a = [...current.comisionIds].sort();
  const b = [...next.comisionIds].sort();
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

/** Update payload: editable fields + dot-path term slot.
 *  Dot-path keeps other terms' history intact without a read-modify-write.
 *  The slot is written even when empty — clearing a cargo must overwrite it —
 *  BUT is omitted entirely when the assignment is unchanged: re-stamping it would
 *  trip the rules' `positionsAssignmentSafe` gate (self-stamp + power-cargo checks),
 *  denying an otherwise-fine bio edit for a non-Admin editor of a power-cargo member. */
export function toMemberUpdateDoc(
  data: MemberInput,
  assignedBy: string,
  // Required (may be null) — an omitted `current` silently reverts to always-write,
  // reintroducing the re-gate bug; force callers to be explicit.
  current: Pick<TermPositions, "cargoId" | "comisionIds"> | null,
  termKey = currentTermKey(),
): UpdateDoc {
  const next = { cargoId: data.cargoId, comisionIds: data.comisionIds };
  if (sameAssignment(current, next)) return editableFields(data);
  return {
    ...editableFields(data),
    [`positions.${termKey}`]: { ...next, assignedBy },
  };
}
