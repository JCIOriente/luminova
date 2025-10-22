import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User as FirebaseUser,
} from "firebase/auth";
import { auth } from "../../../libs/firebase";
import type { AuthUser, LoginCredentials } from "../types/auth";

const mapFirebaseUser = (user: FirebaseUser): AuthUser => ({
  id: user.uid,
  email: user.email || "",
  displayName: user.displayName,
  photoURL: user.photoURL,
});

export class AuthService {
  static async getCurrentUser(): Promise<AuthUser | null> {
    return new Promise((resolve, reject) => {
      const unsubscribe = onAuthStateChanged(
        auth,
        (user) => {
          unsubscribe();
          resolve(user ? mapFirebaseUser(user) : null);
        },
        (error) => {
          unsubscribe();
          reject(error);
        },
      );
    });
  }

  static async login({ email, password }: LoginCredentials): Promise<AuthUser> {
    const { user } = await signInWithEmailAndPassword(auth, email, password);
    return mapFirebaseUser(user);
  }

  static async logout(): Promise<void> {
    await signOut(auth);
  }

  static observeAuthState(
    callback: (user: AuthUser | null) => void,
  ): () => void {
    return onAuthStateChanged(auth, (user) => {
      callback(user ? mapFirebaseUser(user) : null);
    });
  }
}
