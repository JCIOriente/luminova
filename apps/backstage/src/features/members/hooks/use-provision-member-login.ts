import { useMutation } from "@tanstack/react-query";
import { httpsCallable } from "firebase/functions";
import { getFirebase } from "@luminova/firebase";

interface ProvisionResult {
  email: string;
  actionLink: string;
}

export function useProvisionMemberLogin() {
  return useMutation({
    mutationFn: async (memberId: string) => {
      const fn = httpsCallable<{ memberId: string }, ProvisionResult>(
        getFirebase().functions,
        "provisionMemberLogin",
      );
      return (await fn({ memberId })).data;
    },
  });
}
