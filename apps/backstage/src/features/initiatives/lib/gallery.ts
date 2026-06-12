import type { Activity, Photo } from "@luminova/types";

export interface ActivityPhotoGroup {
  activityId: string;
  title: string;
  photos: Photo[];
}

export function groupActivityPhotos(activities: Activity[]): ActivityPhotoGroup[] {
  return activities
    .filter((a) => a.photos.length > 0)
    .sort((a, b) => a.startAt.toMillis() - b.startAt.toMillis())
    .map((a) => ({ activityId: a.id, title: a.title, photos: a.photos }));
}
