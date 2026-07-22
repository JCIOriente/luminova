import { useQuery } from "@tanstack/react-query";
import { NotificationRepository } from "../repositories/notification-repository";
import { notificationKeys } from "./notification-keys";

export function useSentNotifications({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: notificationKeys.sent,
    queryFn: () => new NotificationRepository().listSent(),
    enabled,
  });
}
