import { useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Timestamp } from "firebase/firestore";
import { uploadInitiativePhoto, deleteInitiativePhoto } from "@luminova/firebase";
import type { Photo } from "@luminova/types";
import { ProgramRepository } from "../../programs/repositories/program-repository";
import { ProjectRepository } from "../../projects/repositories/project-repository";
import { programKeys } from "../../programs/hooks/program-keys";
import { projectKeys } from "../../projects/hooks/project-keys";
import { useCurrentMember } from "../../members/hooks/use-current-member";
import { KIND, initiativeDetailKey, type InitiativeType } from "./use-initiative";

export function useInitiativePhotos(type: InitiativeType, id: string, termId: string) {
  const qc = useQueryClient();
  const { data: member } = useCurrentMember();
  const repo = useMemo(
    () => (type === "program" ? new ProgramRepository() : new ProjectRepository()),
    [type],
  );
  const kind = KIND[type];

  const invalidate = useCallback(async () => {
    await qc.invalidateQueries({
      queryKey: type === "program" ? programKeys.byTerm(termId) : projectKeys.byTerm(termId),
    });
    await qc.invalidateQueries({ queryKey: initiativeDetailKey(type, id) });
  }, [qc, type, termId, id]);

  const addPhoto = useCallback(
    async (blob: Blob, caption: string | null = null) => {
      const photoId = crypto.randomUUID();
      const url = await uploadInitiativePhoto(kind, id, photoId, blob);
      const photo: Photo = {
        id: photoId,
        url,
        caption,
        uploadedAt: Timestamp.now(),
        uploadedBy: member?.id ?? "",
      };
      await repo.addPhoto(id, photo);
      await invalidate();
    },
    [kind, id, member?.id, repo, invalidate],
  );

  const removePhotoById = useCallback(
    async (photoId: string) => {
      await repo.removePhoto(id, photoId);
      await deleteInitiativePhoto(kind, id, photoId).catch((err) =>
        console.warn("orphan initiative photo", id, photoId, err),
      );
      await invalidate();
    },
    [kind, id, repo, invalidate],
  );

  const setCover = useCallback(
    async (photoId: string) => {
      await repo.setCover(id, photoId);
      await invalidate();
    },
    [id, repo, invalidate],
  );

  const setCaption = useCallback(
    async (photoId: string, caption: string) => {
      await repo.setCaption(id, photoId, caption);
      await invalidate();
    },
    [id, repo, invalidate],
  );

  return { addPhoto, removePhotoById, setCover, setCaption };
}
