import { createFileRoute } from "@tanstack/react-router";
import { PointRulesPage } from "../features/point-rules/components/point-rules-page";

export const Route = createFileRoute("/_app/point-rules")({
  component: PointRulesPage,
});
