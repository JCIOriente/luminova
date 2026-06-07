import { FirebaseError } from "firebase/app";

const MESSAGES: Record<string, string> = {
  "auth/invalid-credential": "Correo o contraseña incorrectos.",
  // Legacy codes the SDK emits when email-enumeration protection is off
  // (e.g. the emulator). Same message as invalid-credential — never reveal
  // whether the account exists.
  "auth/wrong-password": "Correo o contraseña incorrectos.",
  "auth/user-not-found": "Correo o contraseña incorrectos.",
  "auth/invalid-email": "El correo no es válido.",
  "auth/user-disabled": "Esta cuenta está deshabilitada.",
  "auth/too-many-requests": "Demasiados intentos. Espera un momento e intenta de nuevo.",
  "auth/network-request-failed": "Error de red. Revisa tu conexión.",
  "auth/expired-action-code": "El enlace expiró. Solicita uno nuevo.",
  "auth/invalid-action-code": "El enlace no es válido o ya se usó. Solicita uno nuevo.",
  "auth/weak-password": "La contraseña es demasiado débil.",
  "auth/missing-email": "Ingresa tu correo.",
};

const GENERIC = "No se pudo iniciar sesión. Intenta de nuevo.";

export function authErrorMessage(error: unknown): string {
  if (error instanceof FirebaseError) {
    return MESSAGES[error.code] ?? GENERIC;
  }
  return GENERIC;
}
