import type { AllyInput } from "@luminova/types";

/** Editable fields shared by create and update. */
function editableFields(data: AllyInput) {
  return {
    companyName: data.companyName,
    contactPerson: data.contactPerson,
    phone: data.phone,
    email: data.email,
    category: data.category ?? null,
  };
}

/** New ally document: editable fields + system defaults. Logo is uploaded out-of-band. */
export function toAllyCreateDoc(data: AllyInput) {
  return {
    ...editableFields(data),
    logoUrl: null,
    active: true,
    deletedAt: null,
  };
}

/** Update payload: editable fields only — never touches system-managed fields. */
export function toAllyUpdateDoc(data: AllyInput) {
  return editableFields(data);
}
