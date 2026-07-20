import { createFileRoute } from "@tanstack/react-router";
import { MemberProfilePage } from "../features/members/components/member-profile-page";

export const Route = createFileRoute("/_app/members_/$memberId")({
  component: MemberProfilePage,
});
