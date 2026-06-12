import { useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Timestamp } from "firebase/firestore";
import { uploadActivityPhoto, deleteActivityPhoto } from "@luminova/firebase";
import type { Photo } from "@luminova/types";
import { ActivityRepository } from "../repositories/activity-repository";
import { activityKeys } from "./activity-keys";
import { useCurrentMember } from "../../members/hooks/use-current-member";

export function useActivityPhotos(activityId: string, termId: string) {
  const qc = useQueryClient();
  const { data: member } = useCurrentMember();
  const repo = useMemo(() => new ActivityRepository(), []);

  const invalidate = useCallback(async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: activityKeys.byId(activityId) }),
      qc.invalidateQueries({ queryKey: activityKeys.byTerm(termId) }),
    ]);
  }, [qc, activityId, termId]);

  const addPhoto = useCallback(
    async (blob: Blob, caption: string | null = null) => {
      const photoId = crypto.randomUUID();
      const url = await uploadActivityPhoto(activityId, photoId, blob);
      const photo: Photo = {
        id: photoId,
        url,
        caption,
        uploadedAt: Timestamp.now(),
        uploadedBy: member?.id ?? "",
      };
      await repo.addPhoto(activityId, photo);
      await invalidate();
    },
    [activityId, member?.id, repo, invalidate],
  );

  const removePhotoById = useCallback(
    async (photoId: string) => {
      await repo.removePhoto(activityId, photoId);
      await deleteActivityPhoto(activityId, photoId).catch((err) =>
        console.warn("orphan activity photo", activityId, photoId, err),
      );
      await invalidate();
    },
    [activityId, repo, invalidate],
  );

  const setCover = useCallback(
    async (photoId: string) => {
      await repo.setCover(activityId, photoId);
      await invalidate();
    },
    [activityId, repo, invalidate],
  );

  const setCaption = useCallback(
    async (photoId: string, caption: string) => {
      await repo.setCaption(activityId, photoId, caption);
      await invalidate();
    },
    [activityId, repo, invalidate],
  );

  return { addPhoto, removePhotoById, setCover, setCaption };
}
