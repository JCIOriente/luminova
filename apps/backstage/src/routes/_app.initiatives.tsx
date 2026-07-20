import { createFileRoute } from "@tanstack/react-router";
import { InitiativesPage } from "../features/initiatives/components/initiatives-page";

export const Route = createFileRoute("/_app/initiatives")({ component: InitiativesPage });
