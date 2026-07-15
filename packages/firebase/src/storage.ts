import { connectStorageEmulator, getStorage, type FirebaseStorage } from "firebase/storage";
import { ensureApp, emulatorEnabled, EMULATOR_HOST } from "./app-core.js";

const STORAGE_PORT = 9199;

let storage: FirebaseStorage | null = null;

/**
 * Cloud Storage client. On its own subpath so the storage module (plus the
 * photo/logo upload helpers below) stays out of the login-path eager graph and
 * only loads inside the lazy media-editing route chunks.
 */
export function getStorageService(): FirebaseStorage {
  if (storage) return storage;
  storage = getStorage(ensureApp());
  if (emulatorEnabled()) {
    connectStorageEmulator(storage, EMULATOR_HOST, STORAGE_PORT);
  }
  return storage;
}

export { uploadMemberPhoto, deleteMemberPhoto } from "./member-photo.js";
export { uploadAllyLogo, deleteAllyLogo } from "./ally-logo.js";
export {
  uploadInitiativePhoto,
  deleteInitiativePhoto,
  uploadActivityPhoto,
  deleteActivityPhoto,
} from "./photo-storage.js";
