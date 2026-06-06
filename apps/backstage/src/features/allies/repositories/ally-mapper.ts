import type { AllyInput } from "../types/ally-schema";

/** Editable fields shared by create and update. */
function editableFields(data: AllyInput) {
  return {
    companyName: data.companyName,
    personInCharge: data.personInCharge,
    phone: data.phone,
    email: data.email,
  };
}

/** New ally document: editable fields + system defaults. */
export function toAllyCreateDoc(data: AllyInput) {
  return {
    ...editableFields(data),
    active: true,
    deletedAt: null,
  };
}

/** Update payload: editable fields only — never touches system-managed fields. */
export function toAllyUpdateDoc(data: AllyInput) {
  return editableFields(data);
}
