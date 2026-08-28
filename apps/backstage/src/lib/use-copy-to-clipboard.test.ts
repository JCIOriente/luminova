import { describe, expect, it, afterEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useCopyToClipboard } from "./use-copy-to-clipboard";

/** Install a `navigator.clipboard` for one test. `undefined` models an INSECURE CONTEXT, where
 *  the property does not exist at all — jsdom's navigator has no clipboard either, so this is
 *  the honest default rather than a contrivance. Configurable so afterEach can take it back. */
function stubClipboard(clipboard: { writeText: (t: string) => Promise<void> } | undefined) {
  Object.defineProperty(navigator, "clipboard", {
    value: clipboard,
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  Reflect.deleteProperty(navigator, "clipboard");
});

describe("useCopyToClipboard", () => {
  it("starts idle and writes the text through to the clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard({ writeText });
    const { result } = renderHook(() => useCopyToClipboard());
    expect(result.current.copyState).toBe("idle");
    await act(async () => result.current.copy("https://example.com/link"));
    expect(writeText).toHaveBeenCalledWith("https://example.com/link");
    expect(result.current.copyState).toBe("copied");
  });

  it("reports a rejected write as failed", async () => {
    stubClipboard({ writeText: vi.fn().mockRejectedValue(new Error("denied")) });
    const { result } = renderHook(() => useCopyToClipboard());
    await act(async () => result.current.copy("x"));
    expect(result.current.copyState).toBe("failed");
  });

  // BLOCKING: the reason this hook exists at all. Outside a secure context (plain http, an
  // embedded webview) `navigator.clipboard` is `undefined`, so `navigator.clipboard.writeText`
  // throws a TypeError SYNCHRONOUSLY — there is no promise, so the `.catch()` both call sites
  // used to hang off the call never ran. The failure affordance ("selecciona el enlace y
  // cópialo manualmente") is the ONE case that surface exists for, and it was exactly the case
  // that instead threw out of the onClick handler and rendered nothing.
  it("BLOCKING: reports a synchronous throw (no clipboard API) as failed, not an exception", async () => {
    stubClipboard(undefined);
    const { result } = renderHook(() => useCopyToClipboard());
    expect(() => act(() => result.current.copy("x"))).not.toThrow();
    expect(result.current.copyState).toBe("failed");
  });

  // The same shape one layer in: a clipboard object whose writeText throws rather than
  // rejecting. Pinned separately because a fix that only null-checked `navigator.clipboard`
  // would pass the case above and still throw here.
  it("BLOCKING: reports a writeText that THROWS rather than rejecting as failed", async () => {
    stubClipboard({
      writeText: () => {
        throw new Error("not allowed");
      },
    });
    const { result } = renderHook(() => useCopyToClipboard());
    expect(() => act(() => result.current.copy("x"))).not.toThrow();
    expect(result.current.copyState).toBe("failed");
  });

  it("resetCopyState returns to idle so a re-opened surface does not show a stale result", async () => {
    stubClipboard({ writeText: vi.fn().mockResolvedValue(undefined) });
    const { result } = renderHook(() => useCopyToClipboard());
    await act(async () => result.current.copy("x"));
    expect(result.current.copyState).toBe("copied");
    act(() => result.current.resetCopyState());
    expect(result.current.copyState).toBe("idle");
  });

  // A retry after a failure has to be able to succeed: `copy` sets state on BOTH outcomes, so
  // nothing has to be reset in between. If it only ever set "failed" the button would stay
  // wrong for the rest of the session.
  it("a later successful copy overwrites an earlier failure", async () => {
    stubClipboard(undefined);
    const { result } = renderHook(() => useCopyToClipboard());
    act(() => result.current.copy("x"));
    expect(result.current.copyState).toBe("failed");
    stubClipboard({ writeText: vi.fn().mockResolvedValue(undefined) });
    await act(async () => result.current.copy("x"));
    expect(result.current.copyState).toBe("copied");
  });
});
