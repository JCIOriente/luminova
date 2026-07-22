import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getFirebase } from "@luminova/firebase";
import { requireUid } from "../../../lib/auth/require-uid";
import { InboxRepository } from "../repositories/inbox-repository";
import { inboxKeys } from "./inbox-keys";

export function useMarkRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => new InboxRepository(requireUid()).markRead(id),
    onSuccess: () => {
      const uid = getFirebase().auth.currentUser?.uid;
      if (uid) void queryClient.invalidateQueries({ queryKey: inboxKeys.all(uid) });
    },
  });
}
