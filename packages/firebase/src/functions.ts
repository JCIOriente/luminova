import { connectFunctionsEmulator, getFunctions, type Functions } from "firebase/functions";
import { ensureApp, emulatorEnabled, EMULATOR_HOST } from "./app-core.js";

const FUNCTIONS_PORT = 4020;

let functions: Functions | null = null;

/**
 * Callable Cloud Functions client. On its own subpath so the functions module
 * stays out of the login-path eager graph — only the member-provisioning route
 * pulls it in.
 */
export function getFunctionsService(): Functions {
  if (functions) return functions;
  functions = getFunctions(ensureApp());
  if (emulatorEnabled()) {
    connectFunctionsEmulator(functions, EMULATOR_HOST, FUNCTIONS_PORT);
  }
  return functions;
}
