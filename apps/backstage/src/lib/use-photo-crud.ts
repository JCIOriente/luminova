import { useCallback } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { Timestamp } from "firebase/firestore";
import type { Photo } from "@luminova/types";
import { useCurrentMember } from "../features/members/hooks/use-current-member";

interface PhotoRepository {
  addPhoto(id: string, photo: Photo): Promise<void>;
  removePhoto(id: string, photoId: string): Promise<void>;
  setCover(id: string, photoId: string): Promise<void>;
  setCaption(id: string, photoId: string, caption: string): Promise<void>;
}

export interface PhotoSource {
  id: string;
  repo: PhotoRepository;
  uploadPhoto: (photoId: string, blob: Blob) => Promise<string>;
  deletePhoto: (photoId: string) => Promise<void>;
  invalidationKeys: readonly QueryKey[];
  orphanLabel: string;
}

export interface PhotoCrud {
  addPhoto: (blob: Blob, caption?: string | null) => Promise<void>;
  removePhotoById: (photoId: string) => Promise<void>;
  setCover: (photoId: string) => Promise<void>;
  setCaption: (photoId: string, caption: string) => Promise<void>;
}

export function usePhotoCrud(source: PhotoSource): PhotoCrud {
  const qc = useQueryClient();
  const { data: member } = useCurrentMember();
  const { id, repo, uploadPhoto, deletePhoto, invalidationKeys, orphanLabel } = source;

  const invalidate = useCallback(async () => {
    await Promise.all(invalidationKeys.map((queryKey) => qc.invalidateQueries({ queryKey })));
  }, [qc, invalidationKeys]);

  const addPhoto = useCallback(
    async (blob: Blob, caption: string | null = null) => {
      const photoId = crypto.randomUUID();
      const url = await uploadPhoto(photoId, blob);
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
    [id, member?.id, repo, uploadPhoto, invalidate],
  );

  const removePhotoById = useCallback(
    async (photoId: string) => {
      await repo.removePhoto(id, photoId);
      await deletePhoto(photoId).catch((err) => console.warn(orphanLabel, id, photoId, err));
      await invalidate();
    },
    [id, repo, deletePhoto, orphanLabel, invalidate],
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
