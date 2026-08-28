import { useState } from "react";

export type CopyState = "idle" | "copied" | "failed";

/**
 * Copy-to-clipboard with a result the caller can render. Both places that offer a
 * password-reset link as a manual fallback need exactly this, and a second copy would drift the
 * way the cargo predicates already did once.
 *
 * `navigator.clipboard` is `undefined` outside a secure context, so the property access throws
 * SYNCHRONOUSLY — a bare `.catch()` on the returned promise never runs and the failure
 * affordance never renders, which is the one case it exists for. Hence the try/catch around the
 * call itself, not only the rejection.
 */
export function useCopyToClipboard(): {
  copyState: CopyState;
  copy: (text: string) => void;
  resetCopyState: () => void;
} {
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const copy = (text: string) => {
    try {
      void navigator.clipboard
        .writeText(text)
        .then(() => setCopyState("copied"))
        .catch(() => setCopyState("failed"));
    } catch {
      // No clipboard API at all (insecure context, embedded webview). Same outcome as a
      // rejected write: tell the user to select the text themselves.
      setCopyState("failed");
    }
  };
  return { copyState, copy, resetCopyState: () => setCopyState("idle") };
}
