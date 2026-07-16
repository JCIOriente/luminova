import { useMutation } from "@tanstack/react-query";
import { httpsCallable } from "firebase/functions";
import { getFunctionsService } from "@luminova/firebase/functions";

interface ProvisionResult {
  email: string;
  actionLink: string;
  /** False when the member was provisioned but the invite email couldn't be
   *  enqueued — the UI should then surface the manual access link. */
  emailSent: boolean;
}

export function useProvisionMemberLogin() {
  return useMutation({
    mutationFn: async (memberId: string) => {
      const fn = httpsCallable<{ memberId: string }, ProvisionResult>(
        getFunctionsService(),
        "provisionMemberLogin",
      );
      return (await fn({ memberId })).data;
    },
  });
}
