import { createFileRoute } from "@tanstack/react-router";
import { LeadsPage } from "../features/leads/components/leads-page";

export const Route = createFileRoute("/_app/leads")({
  component: LeadsPage,
});
