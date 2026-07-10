import { createFileRoute } from "@tanstack/react-router";
import { ImpactoPage } from "../components/showcase/impacto-page";

export const Route = createFileRoute("/impacto/")({
  component: ImpactoPage,
});
