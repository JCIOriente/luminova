import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getFirebase } from "@luminova/firebase";
import type { NotificationCreate } from "@luminova/types";
import { NotificationRepository } from "../repositories/notification-repository";
import { notificationKeys } from "./notification-keys";

/** Resolve the composer uid the rules require (`createdBy == request.auth.uid`).
 *  Mirrors member-repository's `currentUid()` guard. */
function currentUid(): string {
  const uid = getFirebase().auth.currentUser?.uid;
  if (!uid) throw new Error("Tu sesión expiró. Inicia sesión nuevamente.");
  return uid;
}

export function useComposeNotification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NotificationCreate) =>
      new NotificationRepository().compose(input, currentUid()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: notificationKeys.sent }),
  });
}
