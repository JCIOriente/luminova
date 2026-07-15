import { useCallback, useMemo } from "react";
import { uploadActivityPhoto, deleteActivityPhoto } from "@luminova/firebase/storage";
import { usePhotoCrud, type PhotoCrud } from "../../../lib/use-photo-crud";
import { ActivityRepository } from "../repositories/activity-repository";
import { activityKeys } from "./activity-keys";

export function useActivityPhotos(activityId: string, termId: string): PhotoCrud {
  const repo = useMemo(() => new ActivityRepository(), []);
  const uploadPhoto = useCallback(
    (photoId: string, blob: Blob) => uploadActivityPhoto(activityId, photoId, blob),
    [activityId],
  );
  const deletePhoto = useCallback(
    (photoId: string) => deleteActivityPhoto(activityId, photoId),
    [activityId],
  );
  const invalidationKeys = useMemo(
    () => [activityKeys.byId(activityId), activityKeys.byTerm(termId)],
    [activityId, termId],
  );

  return usePhotoCrud({
    id: activityId,
    repo,
    uploadPhoto,
    deletePhoto,
    invalidationKeys,
    orphanLabel: "orphan activity photo",
  });
}
