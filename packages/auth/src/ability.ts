import { AbilityBuilder, createMongoAbility, subject, type MongoAbility } from "@casl/ability";
import type { AuthClaims, Role } from "./roles.js";

export { subject };

export type Action = "manage" | "create" | "read" | "update" | "delete" | "checkIn";
export type Subject =
  | "all"
  | "Member"
  | "Ally"
  | "Event"
  | "PointRule"
  | "MemberPoints"
  | "Payment"
  | "Attendance"
  | "Program"
  | "Project"
  | "Activity"
  | "Position";

type SubjectObject = object;
export type AppAbility = MongoAbility<[Action, Subject | SubjectObject]>;

type Can = AbilityBuilder<AppAbility>["can"];

function applyRole(role: Role, claims: AuthClaims, uid: string, can: Can): void {
  switch (role) {
    case "Admin":
      can("manage", "all");
      break;
    case "Membership":
      can("manage", "Member");
      can("read", ["Ally", "Event", "MemberPoints", "Position"]);
      break;
    case "Treasury":
      can("manage", "Payment");
      can("read", ["Member", "MemberPoints"]);
      break;
    case "ExecutiveCommittee":
      can("read", ["Member", "Ally", "Event", "MemberPoints", "Program", "Project"]);
      can("manage", "Position");
      break;
    case "ProjectManager":
      can("manage", ["Project", "Activity", "Program"]);
      can("checkIn", "Attendance");
      can("read", ["Ally", "Event"]);
      break;
    case "Scanner":
      can("checkIn", "Attendance", { eventId: { $in: claims.scannerEventIds ?? [] } });
      // Reach the activity list + detail page (the new home of check-in). Activities
      // are signed-in-readable in firestore.rules; this only opens the backstage UI.
      // Member directory stays closed (no read Member) — Scanner is QR-scan-primary.
      can("read", "Activity");
      break;
    case "Member":
      can(["read", "update"], "Member", { uid });
      can("read", ["MemberPoints", "Event", "Project", "Position"]);
      break;
  }
}

export function buildAbility(claims: AuthClaims, uid: string): AppAbility {
  const builder = new AbilityBuilder<AppAbility>(createMongoAbility);
  for (const role of claims.roles) {
    applyRole(role, claims, uid, builder.can);
  }
  return builder.build();
}
