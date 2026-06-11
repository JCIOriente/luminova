import { currentTermKey, type Member, type MemberInput } from "@luminova/types";
import { dateInputValue } from "../repositories/member-mapper";

export function memberFormDefaults(member: Member): Partial<MemberInput> {
  const term = member.positions?.[currentTermKey()];
  return {
    name: member.name,
    email: member.email,
    phone: member.phone ?? "",
    gender: member.gender,
    profession: member.profession ?? "",
    joinDate: member.joinDate ? dateInputValue(member.joinDate) : "",
    birthdate: member.birthdate ? dateInputValue(member.birthdate) : "",
    status: member.status,
    cargoId: term?.cargoId ?? null,
    comisionIds: term?.comisionIds ?? [],
  };
}
