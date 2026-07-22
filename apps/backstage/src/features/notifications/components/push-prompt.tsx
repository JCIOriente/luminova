import { useEffect, useRef, useState } from "react";
import { Button, Card, Icon, Toast } from "@luminova/ui";
import { getFirebase } from "@luminova/firebase";

const DISMISS_KEY = "backstage.push.prompt.dismissed";

function isDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function persistDismissed(): void {
  try {
    localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    // Non-fatal: the prompt just reappears next session.
  }
}

/** Soft opt-in for web push. Shown post-login on every _app page ONLY while the OS
 *  permission is still "default" and the user hasn't dismissed it. The push
 *  registration module (and firebase/messaging behind it) is dynamically imported on
 *  "Activar" so it never enters the login-path eager graph. */
export function PushPrompt() {
  const uid = getFirebase().auth.currentUser?.uid;
  const promptable =
    typeof Notification !== "undefined" && Notification.permission === "default" && !isDismissed();

  const [visible, setVisible] = useState(promptable);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const unsubscribe = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      unsubscribe.current?.();
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(id);
  }, [toast]);

  if (!uid) return null;

  const dismiss = () => {
    persistDismissed();
    setVisible(false);
  };

  const activate = async () => {
    setBusy(true);
    try {
      const { enablePush, listenForeground } = await import("../../../lib/push-registration");
      const token = await enablePush(uid);
      setVisible(false);
      if (token) {
        persistDismissed();
        unsubscribe.current = await listenForeground((title, body) =>
          setToast(`${title}: ${body}`),
        );
        setToast("Notificaciones activadas.");
      } else {
        setToast("No se pudieron activar las notificaciones.");
      }
    } catch (err) {
      console.error("enablePush failed", err);
      setVisible(false);
      setToast("No se pudieron activar las notificaciones.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {visible && (
        <Card
          as="aside"
          padding="md"
          className="fixed right-4 bottom-4 z-[80] w-[320px] max-w-[calc(100vw-2rem)]"
        >
          <div className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex text-jci-blue" aria-hidden="true">
              {Icon.bell({ s: 20 })}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-ui-sm font-semibold text-ink-1">Activa las notificaciones</p>
              <p className="mt-1 text-ui-xs text-ink-3">
                Recibe avisos de la organización directamente en este dispositivo.
              </p>
              <div className="mt-3 flex items-center gap-2">
                <Button as="button" size="sm" onClick={activate} disabled={busy}>
                  Activar
                </Button>
                <Button as="button" variant="secondary" size="sm" onClick={dismiss} disabled={busy}>
                  Ahora no
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}
      {toast && <Toast message={toast} />}
    </>
  );
}
