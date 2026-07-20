import { createFileRoute } from "@tanstack/react-router";
import { PositionsPage } from "../features/positions/components/positions-page";

export const Route = createFileRoute("/_app/positions")({
  component: PositionsPage,
});
