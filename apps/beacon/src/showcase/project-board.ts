import {
  boardGroupFromCategory,
  genderedTitle,
  type BoardShowcaseItem,
} from "@luminova/types/engine";

// The portrait backs a public <img> on the no-auth site, and members are writable
// by Admin/Membership (and the member themselves). profilePicture is only ever a
// Firebase Storage getDownloadURL result, so constrain it to the Storage hosts —
// this blocks an insider from pointing the public projection at an arbitrary URL
// (tracking pixel / off-origin fetch) via a direct member write. Mirrors projectAlly.
const ALLOWED_PHOTO_HOSTS = ["firebasestorage.googleapis.com", "storage.googleapis.com"];

function isStoragePhotoUrl(value: unknown): value is string {
  if (typeof value !== "string" || !URL.canParse(value)) return false;
  const url = new URL(value);
  return url.protocol === "https:" && ALLOWED_PHOTO_HOSTS.includes(url.hostname);
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
  return typeof cargoId === "string" && cargoId.length > 0 ? cargoId : null;
}

/**
 * Project a raw member doc into a curated public BoardShowcaseItem, or null when
 * the member is not publicly showable (opted out, soft-deleted, missing name/photo,
 * or their current-term cargo is not a CEL/JDL board position). `cargo` is the
 * resolved positions/{cargoId} doc — null when the member holds no current-term
 * cargo or that cargo doc is missing. Only a Firebase Storage https portrait URL
 * is exposed; grants/PII never leave /members.
 */
export function projectBoard(
  id: string,
  member: Record<string, unknown>,
  cargo: BoardCargo | null,
): BoardShowcaseItem | null {
  if (member.publicProfile !== true) return null;
  if (member.deletedAt != null || member.active === false) return null;
  const name = member.name;
  if (typeof name !== "string" || name.length === 0) return null;
  if (!isStoragePhotoUrl(member.profilePicture)) return null;
  if (!cargo) return null;
  const group = boardGroupFromCategory(cargo.category);
  if (!group) return null;
  const title = typeof cargo.title === "string" ? cargo.title : "";
  if (title.length === 0) return null;
  const titleFemale = typeof cargo.titleFemale === "string" ? cargo.titleFemale : null;
  const gender = member.gender === "Femenino" ? "Femenino" : undefined;
  return {
    id,
    name,
    title: genderedTitle(title, titleFemale, gender),
    group,
    portraitUrl: member.profilePicture,
  };
}
