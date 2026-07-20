import { createFileRoute, notFound } from "@tanstack/react-router";
import { InitiativeDetailPage } from "../features/initiatives/components/initiative-detail-page";

export const Route = createFileRoute("/_app/initiatives_/$type/$id")({
  beforeLoad: ({ params }) => {
    if (params.type !== "program" && params.type !== "project") throw notFound();
  },
  component: InitiativeDetailPage,
});
