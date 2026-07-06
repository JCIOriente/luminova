import { useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Timestamp } from "firebase/firestore";
import { uploadInitiativePhoto, deleteInitiativePhoto } from "@luminova/firebase";
import type { Photo } from "@luminova/types";
import { InitiativeRepository } from "../repositories/initiative-repository";
import { INITIATIVE_CONFIG, type InitiativeType } from "../lib/initiative-kind";
import { initiativeKeys, initiativeDetailKey } from "./initiative-keys";
import { useCurrentMember } from "../../members/hooks/use-current-member";

export function useInitiativePhotos(type: InitiativeType, id: string, termId: string) {
  const qc = useQueryClient();
  const { data: member } = useCurrentMember();
  const repo = useMemo(() => new InitiativeRepository(type), [type]);
  const { kind, collection } = INITIATIVE_CONFIG[type];

  const invalidate = useCallback(async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: initiativeKeys(collection).byTerm(termId) }),
      qc.invalidateQueries({ queryKey: initiativeDetailKey(type, id) }),
    ]);
  }, [qc, collection, type, termId, id]);

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
