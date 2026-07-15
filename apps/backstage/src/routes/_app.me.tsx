import { createFileRoute } from "@tanstack/react-router";
import { MemberHome } from "../components/member-home";

export const Route = createFileRoute("/_app/me")({ component: MemberHome });
