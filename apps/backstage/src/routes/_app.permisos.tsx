import { createFileRoute } from "@tanstack/react-router";
import { PermisosPage } from "../features/positions/components/permisos-page";

export const Route = createFileRoute("/_app/permisos")({
  component: PermisosPage,
});
