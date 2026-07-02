import {
  collection,
  addDoc,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  where,
  getCountFromServer,
  arrayUnion,
} from "firebase/firestore";
import { getFirebase } from "@luminova/firebase";
import type { Activity, ActivityInput, Photo } from "@luminova/types";
import { toActivityCreateDoc, toActivityUpdateDoc } from "./activity-mapper";
import { lockedFieldsChanged, ActivityLockedError } from "./activity-guard";
import {
  removePhoto as dropPhoto,
  moveCover,
  setCaption as relabel,
} from "../../initiatives/repositories/photo-array";

/** Normalize a raw doc — `location` predates this field, so default it to null. */
function parseActivity(id: string, data: Omit<Activity, "id">): Activity {
  return { id, ...data, location: data.location ?? null };
}

export class ActivityRepository {
  private readonly db = getFirebase().db;
  private readonly collection = collection(this.db, "activities");

  /** Activities for a term, newest start first. */
  async getByTerm(termId: string): Promise<Activity[]> {
    const snapshot = await getDocs(query(this.collection, where("termId", "==", termId)));
    return snapshot.docs
      .map((d) => parseActivity(d.id, d.data() as Omit<Activity, "id">))
      .sort((a, b) => b.startAt.toMillis() - a.startAt.toMillis());
  }

  async getById(id: string): Promise<Activity | null> {
    const snapshot = await getDoc(doc(this.collection, id));
    if (!snapshot.exists()) return null;
    return parseActivity(snapshot.id, snapshot.data() as Omit<Activity, "id">);
  }

  /** Number of check-ins referencing this activity (engine-safety guard input). */
  async countCheckIns(activityId: string): Promise<number> {
    const checkIns = collection(this.db, "checkIns");
    const snap = await getCountFromServer(query(checkIns, where("activityId", "==", activityId)));
    return snap.data().count;
  }

  async create(data: ActivityInput, termId: string): Promise<string> {
    const ref = await addDoc(this.collection, toActivityCreateDoc(data, termId));
    return ref.id;
  }

  /** Edit an activity. Locks startAt/category/parent once check-ins exist (retro-points). */
  async update(id: string, data: ActivityInput): Promise<void> {
    const existing = await this.getById(id);
    if (!existing) throw new Error("Actividad no encontrada.");
    if ((await this.countCheckIns(id)) > 0) {
      const changed = lockedFieldsChanged(
        {
          category: existing.category,
          startAt: existing.startAt.toMillis(),
          parentType: existing.parentType,
          parentId: existing.parentId,
        },
        {
          category: data.category,
          startAt: new Date(`${data.startAt}:00Z`).getTime(),
          parentType: data.parentType,
          parentId: data.parentId,
        },
      );
      if (changed) throw new ActivityLockedError();
    }
    await updateDoc(doc(this.collection, id), toActivityUpdateDoc(data));
  }

  /** Soft-cancel — never hard-delete an activity referenced by the engine. */
  async cancel(id: string): Promise<void> {
    await updateDoc(doc(this.collection, id), { status: "Cancelada" });
  }

  async addPhoto(id: string, photo: Photo): Promise<void> {
    await updateDoc(doc(this.collection, id), { photos: arrayUnion(photo) });
  }

  async removePhoto(id: string, photoId: string): Promise<void> {
    const row = await this.getById(id);
    if (!row) throw new Error("Actividad no encontrada.");
    await updateDoc(doc(this.collection, id), { photos: dropPhoto(row.photos, photoId) });
  }

  async setCover(id: string, photoId: string): Promise<void> {
    const row = await this.getById(id);
    if (!row) throw new Error("Actividad no encontrada.");
    await updateDoc(doc(this.collection, id), { photos: moveCover(row.photos, photoId) });
  }

  async setCaption(id: string, photoId: string, caption: string): Promise<void> {
    const row = await this.getById(id);
    if (!row) throw new Error("Actividad no encontrada.");
    await updateDoc(doc(this.collection, id), { photos: relabel(row.photos, photoId, caption) });
  }
}
