import { createFileRoute } from "@tanstack/react-router";
import { ActivitiesPage } from "../features/activities/components/activities-page";

export const Route = createFileRoute("/_app/activities")({ component: ActivitiesPage });
