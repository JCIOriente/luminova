import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getFirebase } from "@luminova/firebase";
import { InboxRepository } from "../repositories/inbox-repository";
import { inboxKeys } from "./inbox-keys";

/** Resolve the owner uid the rules require (`auth.uid == memberId`). */
function currentUid(): string {
  const uid = getFirebase().auth.currentUser?.uid;
  if (!uid) throw new Error("Tu sesión expiró. Inicia sesión nuevamente.");
  return uid;
}

export function useMarkRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => new InboxRepository(currentUid()).markRead(id),
    onSuccess: () => {
      const uid = getFirebase().auth.currentUser?.uid;
      if (uid) void queryClient.invalidateQueries({ queryKey: inboxKeys.all(uid) });
    },
  });
}
