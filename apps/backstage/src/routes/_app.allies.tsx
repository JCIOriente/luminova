import { createFileRoute } from "@tanstack/react-router";
import { AlliesPage } from "../features/allies/components/allies-page";

export const Route = createFileRoute("/_app/allies")({
  component: AlliesPage,
});
