import { FirebaseError } from "firebase/app";

const MESSAGES: Record<string, string> = {
  "auth/invalid-credential": "Correo o contraseña incorrectos.",
  "auth/invalid-email": "El correo no es válido.",
  "auth/user-disabled": "Esta cuenta está deshabilitada.",
  "auth/too-many-requests": "Demasiados intentos. Espera un momento e intenta de nuevo.",
  "auth/network-request-failed": "Error de red. Revisa tu conexión.",
};

const GENERIC = "No se pudo iniciar sesión. Intenta de nuevo.";

export function authErrorMessage(error: unknown): string {
  if (error instanceof FirebaseError) {
    return MESSAGES[error.code] ?? GENERIC;
  }
  return GENERIC;
}
