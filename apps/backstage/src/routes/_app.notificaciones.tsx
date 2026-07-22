import { createFileRoute } from "@tanstack/react-router";
import { NotificationsPage } from "../features/notifications/components/notifications-page";

export const Route = createFileRoute("/_app/notificaciones")({
  component: NotificationsPage,
});
