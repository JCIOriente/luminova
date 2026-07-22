import { useState } from "react";
import { Button, Icon } from "@luminova/ui";

const DISMISS_KEY = "jci.push.dismissed";

type PromptStatus = "idle" | "working" | "success" | "error";

// A Notification API + a Service Worker are the hard requirements for web push.
function pushCapable(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof Notification !== "undefined" &&
    "serviceWorker" in navigator
  );
}

// iOS delivers web push ONLY to an installed (home-screen) PWA (Safari 16.4+); in a
// regular browser tab the opt-in is a dead end, so the prompt must not appear there.
function isIOS(): boolean {
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    typeof (navigator as Navigator & { standalone?: boolean }).standalone === "boolean"
  );
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function wasDismissed(): boolean {
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
    // localStorage can throw (private mode / blocked storage). A failed persist just
    // means the prompt may reappear next visit — not worth surfacing to the visitor.
  }
}

// Computed once (lazy useState initializer) — the permission/localStorage/iOS reads
// don't change within a render lifetime, so re-evaluating every render is wasted work.
function shouldOfferPush(): boolean {
  if (!pushCapable()) return false;
  if (Notification.permission !== "default") return false;
  if (wasDismissed()) return false;
  if (isIOS() && !isStandalone()) return false;
  return true;
}

export function PushPrompt() {
  const [visible, setVisible] = useState(shouldOfferPush);
  const [status, setStatus] = useState<PromptStatus>("idle");

  if (!visible) return null;

  async function activate() {
    setStatus("working");
    try {
      const { enablePush } = await import("./push-registration");
      const token = await enablePush();
      if (token) {
        setStatus("success");
        setTimeout(() => setVisible(false), 3000);
      } else {
        setStatus("error");
      }
    } catch (err) {
      console.error("No se pudo activar las notificaciones", err);
      setStatus("error");
    }
  }

  function dismiss() {
    persistDismissed();
    setVisible(false);
  }

  return (
    <div
      role="dialog"
      aria-label="Activar notificaciones"
      style={{
        position: "fixed",
        left: 16,
        right: 16,
        bottom: 16,
        zIndex: 80,
        marginInline: "auto",
        maxWidth: 420,
        padding: 20,
        borderRadius: 16,
        background: "var(--surface-1)",
        border: "1px solid var(--line)",
        boxShadow: "0 18px 48px -16px rgba(19,15,45,0.45)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <span
          aria-hidden="true"
          style={{ display: "inline-flex", color: "var(--jci-blue)", marginTop: 2 }}
        >
          <Icon.megaphone />
        </span>
        <div style={{ flex: 1 }}>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "var(--ink-1)" }}>
            Recibe avisos de JCI Oriente
          </p>
          <p style={{ margin: "6px 0 0", fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.5 }}>
            Entérate de nuestros próximos eventos y convocatorias directamente en tu dispositivo.
          </p>
          {status === "success" ? (
            <p
              role="status"
              style={{
                margin: "12px 0 0",
                fontSize: 13,
                color: "var(--jci-blue)",
                fontWeight: 600,
              }}
            >
              ¡Listo! Te avisaremos de las novedades.
            </p>
          ) : (
            <>
              {status === "error" ? (
                <p
                  role="alert"
                  style={{ margin: "12px 0 0", fontSize: 13, color: "var(--danger)" }}
                >
                  No pudimos activar las notificaciones. Inténtalo más tarde.
                </p>
              ) : null}
              <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                <Button
                  as="button"
                  type="button"
                  variant="primary"
                  disabled={status === "working"}
                  onClick={activate}
                >
                  {status === "working" ? "Activando…" : "Activar"}
                </Button>
                <Button as="button" type="button" variant="ghost" onClick={dismiss}>
                  Ahora no
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
