import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { uploadMemberPhoto, deleteMemberPhoto } from "@luminova/firebase";
import { MemberRepository } from "../repositories/member-repository";
import { memberKeys } from "./member-keys";

export function useMemberPhoto(memberId: string) {
  const queryClient = useQueryClient();

  const onUpload = useCallback(
    async (blob: Blob) => {
      const url = await uploadMemberPhoto(memberId, blob);
      await new MemberRepository().setProfilePicture(memberId, url);
      await queryClient.invalidateQueries({ queryKey: memberKeys.all });
    },
    [memberId, queryClient],
  );

  const onRemove = useCallback(async () => {
    await new MemberRepository().setProfilePicture(memberId, null);
    await deleteMemberPhoto(memberId).catch((err) => {
      console.warn("orphan member photo", memberId, err);
    });
    await queryClient.invalidateQueries({ queryKey: memberKeys.all });
  }, [memberId, queryClient]);

  return { onUpload, onRemove };
}
