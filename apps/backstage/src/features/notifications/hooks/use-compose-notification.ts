import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { NotificationCreate } from "@luminova/types";
import { requireUid } from "../../../lib/auth/require-uid";
import { NotificationRepository } from "../repositories/notification-repository";
import { notificationKeys } from "./notification-keys";

export function useComposeNotification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NotificationCreate) =>
      new NotificationRepository().compose(input, requireUid()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: notificationKeys.sent }),
  });
}
