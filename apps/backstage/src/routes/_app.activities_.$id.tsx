import { createFileRoute } from "@tanstack/react-router";
import { ActivityDetailPage } from "../features/activities/components/activity-detail-page";

export const Route = createFileRoute("/_app/activities_/$id")({ component: ActivityDetailPage });
