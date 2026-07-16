import { useSyncExternalStore } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// Module-scope capture: `beforeinstallprompt` fires once per page load, often
// before the (code-split) page that shows the install button has mounted. A
// component-scoped listener would miss it and lose it on unmount, so we stash
// the event here and register the listener at import time. main.tsx imports this
// module eagerly so the listener is attached before the event can fire.
let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    notify();
  });
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

async function promptInstall() {
  const event = deferredPrompt;
  if (!event) return;
  // Clear before awaiting: prompt() is single-use, so a second click must be a
  // no-op rather than reject on the consumed event.
  deferredPrompt = null;
  notify();
  try {
    await event.prompt();
  } catch {
    // Browser already consumed or dismissed the prompt — nothing to recover.
  }
}

export function useInstallPrompt() {
  const canInstall = useSyncExternalStore(
    subscribe,
    () => deferredPrompt !== null,
    () => false,
  );
  return { canInstall, promptInstall };
}
