import { useMutation } from "@tanstack/react-query";
import { httpsCallable } from "firebase/functions";
import { getFunctionsService } from "@luminova/firebase/functions";

interface ProvisionResult {
  email: string;
  actionLink: string;
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
