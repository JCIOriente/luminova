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
