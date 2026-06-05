import { Timestamp } from "firebase/firestore";
import type { MemberInput } from "../types/member-schema";

function toTimestamp(dateString: string): Timestamp {
  return Timestamp.fromDate(new Date(`${dateString}T00:00:00`));
}

/** Format a Firestore Timestamp as a `YYYY-MM-DD` string for date inputs. */
export function dateInputValue(timestamp: Timestamp): string {
  const date = timestamp.toDate();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Editable fields shared by create and update. */
function editableFields(data: MemberInput) {
  return {
    name: data.name,
    email: data.email,
    phone: data.phone ?? "",
    role: data.role,
    profession: data.profession ?? "",
    joinDate: toTimestamp(data.joinDate),
    birthdate: toTimestamp(data.birthdate),
    status: data.status,
  };
}

/** New member document: editable fields + system defaults. */
export function toMemberCreateDoc(data: MemberInput) {
  return {
    ...editableFields(data),
    profilePicture: null,
    totalPoints: 0,
    active: true,
    deletedAt: null,
  };
}

/** Update payload: editable fields only — never touches system-managed fields. */
export function toMemberUpdateDoc(data: MemberInput) {
  return editableFields(data);
}
