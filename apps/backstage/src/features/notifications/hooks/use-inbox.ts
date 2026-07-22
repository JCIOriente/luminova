import { useQuery } from "@tanstack/react-query";
import { getFirebase } from "@luminova/firebase";
import type { InboxDoc } from "@luminova/types";
import { InboxRepository } from "../repositories/inbox-repository";
import { inboxKeys } from "./inbox-keys";

/** The signed-in member's own inbox. The rules key each copy by the member's Auth
 *  uid, so the query is disabled until a uid is present (mirrors the composer). */
export function useInbox() {
  const uid = getFirebase().auth.currentUser?.uid;
  return useQuery({
    queryKey: inboxKeys.all(uid ?? "none"),
    queryFn: () => new InboxRepository(uid!).list(),
    enabled: !!uid,
  });
}

/** Unread count for the bell badge. */
export function unreadCount(items: InboxDoc[] | undefined): number {
  return items?.filter((item) => !item.read).length ?? 0;
}
