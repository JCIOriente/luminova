import { useMutation, useQueryClient } from "@tanstack/react-query";
import { httpsCallable } from "firebase/functions";
import { getFunctionsService } from "@luminova/firebase/functions";
import { memberKeys } from "./member-keys";

/** What an invite actually produced.
 *
 *  `emailSent`, `fallbackLink` and `mailError` are gone: they encoded "mail primary, link
 *  fallback" as an invariant. There is no mail any more — Firebase's transactional email is
 *  unbrandable, routes through firebaseapp.com and lands in spam — so the link is the only
 *  delivery mechanism, always shown, never a fallback. Keeping `fallbackLink` under any name
 *  would preserve a distinction that no longer exists. */
export interface InviteResult {
  email: string;
  /** The bearer credential. Returned once; nothing stores the plaintext. The operator shares
   *  the assembled link by hand, so treat it as one. */
  token: string;
  /** Epoch ms. */
  expiresAt: number;
  /** Whether a still-pending link was revoked to mint this one. Drives the copy dialog's
   *  title — the visible half of our advantage over a Firebase oobCode, which invalidates the
   *  previously-sent code silently, with no record and no way to tell the operator. */
  replacedPreviousLink: boolean;
}

/**
 * Issue a member's access link. ONE callable, and everything that must happen lives in
 * `mutationFn`.
 *
 * That is not stylistic. The mail used to be sent from a component-scoped
 * `provision.mutate(id, { onSuccess })` callback, and TanStack Query v5 runs those only
 * `if (this.#mutateOptions && this.hasListeners())` (query-core `mutationObserver`), so an
 * operator who navigated away — or, on the profile page, merely switched to another member,
 * since `InviteAccess` is keyed by member id — got the Auth account created, the uid linked,
 * and NO mail ever sent, with no error anywhere. The shape survives the redesign because the
 * same hazard would apply to anything sequenced after the callable.
 */
export function useIssueMemberInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (memberId: string): Promise<InviteResult> => {
      const fn = httpsCallable<{ memberId: string }, InviteResult>(
        getFunctionsService(),
        "issueMemberInvite",
      );
      return (await fn({ memberId })).data;
    },
    // beacon writes members/{id}.uid AND members/{id}.invite; without this the cached member
    // keeps both stale for the 5-minute default staleTime, so the badge and the action label
    // would still describe the state before this click. `settled`, not `success`: the callable
    // can fail after linkUid. memberKeys.all is a prefix of memberKeys.detail, so one call
    // covers both.
    onSettled: () => queryClient.invalidateQueries({ queryKey: memberKeys.all }),
  });
}
