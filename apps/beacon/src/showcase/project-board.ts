import {
  boardGroupFromCategory,
  boardRank,
  genderedTitle,
  type BoardShowcaseItem,
} from "@luminova/types/engine";

// The portrait backs a public <img> on the no-auth site, and members are writable
// by Admin/Membership (and the member themselves) — so a member's profilePicture is
// untrusted input at this trust boundary. It is only ever set by uploadMemberPhoto →
// getDownloadURL, which yields exactly:
//   https://firebasestorage.googleapis.com/v0/b/<bucket>/o/members%2F<id>%2Fprofile.jpg?...
// Pin the URL to THIS project's own bucket AND to this member's own object path — a
// bare hostname allowlist (firebasestorage.googleapis.com is shared by every Firebase
// project) would still accept an attacker-controlled bucket, letting an insider render
// arbitrary content / a tracking pixel on the public site via a direct member write.
function memberPhotoObject(memberId: string): string {
  return encodeURIComponent(`members/${memberId}/profile.jpg`);
}

function isMemberPhotoUrl(value: unknown, memberId: string, projectId: string): value is string {
  if (typeof value !== "string" || !URL.canParse(value) || projectId.length === 0) return false;
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "firebasestorage.googleapis.com") return false;
  const object = memberPhotoObject(memberId);
  // Both bucket spellings a project may use (legacy .appspot.com + newer .firebasestorage.app).
  return [`${projectId}.appspot.com`, `${projectId}.firebasestorage.app`].some(
    (bucket) => url.pathname === `/v0/b/${bucket}/o/${object}`,
  );
}

/** The resolved positions/{cargoId} catalog doc fields the projection needs. */
export interface BoardCargo {
  category: unknown;
  title: unknown;
  titleFemale?: unknown;
}

/** The member's current-term cargo id, or null when they hold no cargo this term. */
export function currentCargoId(member: Record<string, unknown>, termKey: string): string | null {
  const positions = member.positions;
  if (!positions || typeof positions !== "object" || Array.isArray(positions)) return null;
  const term = (positions as Record<string, unknown>)[termKey];
  if (!term || typeof term !== "object") return null;
  const cargoId = (term as { cargoId?: unknown }).cargoId;
  // Reject a "/" — cargoId flows into a `positions/${cargoId}` doc-path template, and a
  // slash would let untrusted member data reach into a nested/unintended reference.
  if (typeof cargoId !== "string" || cargoId.length === 0 || cargoId.includes("/")) return null;
  return cargoId;
}

/**
 * Project a raw member doc into a curated public BoardShowcaseItem, or null when
 * the member is not publicly showable (opted out, soft-deleted, missing name/photo,
 * or their current-term cargo is not a CEL/JDL board position). `cargo` is the
 * resolved positions/{cargoId} doc — null when the member holds no current-term
 * cargo or that cargo doc is missing. `projectId` pins the portrait URL to this
 * project's own bucket + this member's own object. Only that URL is exposed;
 * grants/PII never leave /members.
 */
export function projectBoard(
  id: string,
  member: Record<string, unknown>,
  cargo: BoardCargo | null,
  projectId: string,
): BoardShowcaseItem | null {
  if (member.publicProfile !== true) return null;
  // No uid = no login = no /me = no way to switch publication off. Since the flag now
  // defaults to on (stamped server-side at create), publishing an unprovisioned member
  // would be publication with an unreachable opt-out — the self lane keys on
  // `resource.data.uid == request.auth.uid`. Publish only members who can revoke it.
  if (typeof member.uid !== "string" || member.uid.length === 0) return null;
  if (member.deletedAt != null || member.active === false) return null;
  // setStatus writes `status` only and leaves `active` true, so an expelled member is
  // not soft-deleted. With publication defaulting to on, an unchecked status would keep
  // them on the public Directiva until someone noticed.
  if (member.status === "Desafiliado") return null;
  const name = member.name;
  if (typeof name !== "string" || name.length === 0) return null;
  if (!isMemberPhotoUrl(member.profilePicture, id, projectId)) return null;
  if (!cargo) return null;
  const group = boardGroupFromCategory(cargo.category);
  if (!group) return null;
  const title = typeof cargo.title === "string" ? cargo.title.trim() : "";
  if (title.length === 0) return null;
  const titleFemale = typeof cargo.titleFemale === "string" ? cargo.titleFemale : null;
  const gender = member.gender === "Femenino" ? "Femenino" : undefined;
  return {
    id,
    name,
    title: genderedTitle(title, titleFemale, gender),
    group,
    rank: boardRank(group, title),
    portraitUrl: member.profilePicture,
  };
}
