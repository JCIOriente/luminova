import { createFileRoute } from "@tanstack/react-router";
import { ConfigPage } from "../features/site-config/components/config-page";

export const Route = createFileRoute("/_app/config")({
  component: ConfigPage,
});
