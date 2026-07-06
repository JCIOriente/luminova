import { useCallback, useMemo } from "react";
import { uploadInitiativePhoto, deleteInitiativePhoto } from "@luminova/firebase";
import { usePhotoCrud, type PhotoCrud } from "../../../lib/use-photo-crud";
import { InitiativeRepository } from "../repositories/initiative-repository";
import { INITIATIVE_CONFIG, type InitiativeType } from "../lib/initiative-kind";
import { initiativeKeys, initiativeDetailKey } from "./initiative-keys";

export function useInitiativePhotos(type: InitiativeType, id: string, termId: string): PhotoCrud {
  const repo = useMemo(() => new InitiativeRepository(type), [type]);
  const { kind, collection } = INITIATIVE_CONFIG[type];
  const uploadPhoto = useCallback(
    (photoId: string, blob: Blob) => uploadInitiativePhoto(kind, id, photoId, blob),
    [kind, id],
  );
  const deletePhoto = useCallback(
    (photoId: string) => deleteInitiativePhoto(kind, id, photoId),
    [kind, id],
  );
  const invalidationKeys = useMemo(
    () => [initiativeKeys(collection).byTerm(termId), initiativeDetailKey(type, id)],
    [collection, termId, type, id],
  );

  return usePhotoCrud({
    id,
    repo,
    uploadPhoto,
    deletePhoto,
    invalidationKeys,
    orphanLabel: "orphan initiative photo",
  });
}
