import { useMutation, useQueryClient } from "@tanstack/react-query";
import { httpsCallable } from "firebase/functions";
import { getFunctionsService } from "@luminova/firebase/functions";
import { requestPasswordReset } from "../../../lib/auth/request-password-reset";
import { memberKeys } from "./member-keys";

interface ProvisionResult {
  email: string;
  actionLink: string;
}

/** What an invite actually produced. The MAIL is part of it, not a follow-up the caller
 *  arranges: every new login is delivered by `sendPasswordResetEmail`, board seat or not, Admin
 *  caller or delegate. */
export interface InviteResult {
  email: string;
  emailSent: boolean;
  /** The action link, and ONLY when the mail did not go out.
   *
   *  It is `generatePasswordResetLink`'s oobCode URL, and Firebase keeps just the most recent
   *  password-reset code valid per user — so the mail this hook sends right after INVALIDATES
   *  it. Offering it as "por si no le llega el correo" alongside a mail that did go out hands
   *  the operator a link that fails with `auth/invalid-action-code`. Nulled here rather than at
   *  each call site: the three surfaces that render it cannot each be trusted to re-derive
   *  which of two secrets is the live one. */
  fallbackLink: string | null;
  /** The mail failure's raw message — the only diagnostic for App Check / quota / config. */
  mailError: string | null;
}

/**
 * Provision a member's login AND deliver it. Both steps live in `mutationFn` on purpose.
 *
 * The mail used to be sent from a component-scoped `provision.mutate(id, { onSuccess })`
 * callback. TanStack Query v5 runs those only `if (this.#mutateOptions && this.hasListeners())`
 * (query-core `mutationObserver`), so an operator who navigated away — or, on the profile page,
 * merely switched to another member, since `InviteAccess` is keyed by member id — got the Auth
 * account created, the uid linked, and NO mail ever sent, with no error anywhere. The member
 * then has a login they were never told about, and `memberProvisionBlocked` (hasLogin) hides
 * the retry from the delegate who caused it.
 *
 * `mutationFn` has no such condition: it runs to completion regardless of who is still
 * mounted.
 */
export function useProvisionMemberLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (memberId: string): Promise<InviteResult> => {
      const fn = httpsCallable<{ memberId: string }, ProvisionResult>(
        getFunctionsService(),
        "provisionMemberLogin",
      );
      const { email, actionLink } = (await fn({ memberId })).data;
      // A mail failure is NOT a provisioning failure: the account exists and the uid is
      // linked, and rejecting here would read as "nothing happened" and invite a retry the
      // adoption guard refuses.
      try {
        await requestPasswordReset(email);
        return { email, emailSent: true, fallbackLink: null, mailError: null };
      } catch (err) {
        console.error("No se pudo enviar el correo de acceso", err);
        return {
          email,
          emailSent: false,
          fallbackLink: actionLink || null,
          mailError: err instanceof Error ? err.message : String(err),
        };
      }
    },
    // beacon writes `members/{id}.uid`; without this the cached member keeps `uid: undefined`
    // for the 5-minute default staleTime, so the button neither disappears nor relabels and a
    // second click 403s on the adoption guard. `settled`, not `success`: the callable can fail
    // after linkUid. memberKeys.all is a prefix of memberKeys.detail, so one call covers both.
    onSettled: () => queryClient.invalidateQueries({ queryKey: memberKeys.all }),
  });
}
