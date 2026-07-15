// App-local by necessity, not copy-paste: `virtual:pwa-register/react` is
// injected per-app by vite-plugin-pwa, so this adapter can't live in the shared
// @luminova/ui package (its isolated tsc build has no such module). The reusable
// UI is extracted as PWAReloadPrompt; this file is just the app-scoped wiring.
import { useRegisterSW } from "virtual:pwa-register/react";
import { PWAReloadPrompt } from "@luminova/ui";

export function PwaUpdater() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW();

  return (
    <PWAReloadPrompt
      needRefresh={needRefresh}
      offlineReady={offlineReady}
      onReload={() => updateServiceWorker(true)}
      onDismiss={() => {
        setNeedRefresh(false);
        setOfflineReady(false);
      }}
    />
  );
}
