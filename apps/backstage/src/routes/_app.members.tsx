import { createFileRoute } from "@tanstack/react-router";
import { MembersPage } from "../features/members/components/members-page";

export const Route = createFileRoute("/_app/members")({
  component: MembersPage,
});
