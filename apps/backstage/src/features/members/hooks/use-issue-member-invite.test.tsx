import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const callable = vi.fn();
vi.mock("firebase/functions", () => ({ httpsCallable: () => callable }));
vi.mock("@luminova/firebase/functions", () => ({ getFunctionsService: () => ({}) }));

import { useIssueMemberInvite } from "./use-issue-member-invite";

function wrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const hook = renderHook(() => useIssueMemberInvite(), { wrapper: wrapper(client) });
  return { ...hook, client, invalidate };
}

const RESULT = {
  email: "ana@jci.bo",
  token: "t".repeat(43),
  expiresAt: 1_700_000_000_000,
  replacedPreviousLink: false,
};

describe("useIssueMemberInvite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    callable.mockResolvedValue({ data: RESULT });
  });

  it("calls issueMemberInvite and returns the minted link's parts", async () => {
    // No mail step any more: there is no requestPasswordReset to mock, because there is no
    // Firebase email anywhere in the auth flow. The link is the only delivery mechanism.
    const { result } = setup();
    const invite = await result.current.mutateAsync("m1");
    expect(callable).toHaveBeenCalledWith({ memberId: "m1" });
    expect(invite).toEqual(RESULT);
  });

  it("passes through replacedPreviousLink so the dialog can say the old link died", async () => {
    callable.mockResolvedValue({ data: { ...RESULT, replacedPreviousLink: true } });
    const { result } = setup();
    await expect(result.current.mutateAsync("m1")).resolves.toMatchObject({
      replacedPreviousLink: true,
    });
  });

  it("rejects when the callable refuses, carrying the tag the UI explains", async () => {
    callable.mockRejectedValue(
      Object.assign(new Error("denied"), { details: { reason: "power-seat-requires-admin" } }),
    );
    const { result } = setup();
    await expect(result.current.mutateAsync("m1")).rejects.toMatchObject({
      details: { reason: "power-seat-requires-admin" },
    });
  });

  // BLOCKING — kept from the original suite. The mutation body must run to completion
  // regardless of who is still mounted: TanStack Query v5 runs component-scoped
  // mutate(id, { onSuccess }) callbacks only while the observer still hasListeners(), and on
  // the profile page merely switching members unmounts InviteAccess (it is keyed by member
  // id). Everything that must happen lives in mutationFn, which has no such condition.
  it("BLOCKING: completes the callable even when the caller unmounts first", async () => {
    let resolveCallable: (v: unknown) => void = () => {};
    callable.mockReturnValue(
      new Promise((resolve) => {
        resolveCallable = resolve;
      }),
    );
    const { result, unmount } = setup();
    result.current.mutate("m1");
    unmount();
    resolveCallable({ data: RESULT });
    await waitFor(() => expect(callable).toHaveBeenCalledWith({ memberId: "m1" }));
  });

  // beacon writes members/{id}.uid AND members/{id}.invite. Without this the cached member
  // keeps the old values for the 5-minute default staleTime, so the badge and the button
  // label both go stale — and the button would still offer "Invitar acceso" for a member who
  // now has a pending link.
  it("BLOCKING: invalidates the members cache, including after a failure", async () => {
    const { result, invalidate } = setup();
    await result.current.mutateAsync("m1");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["members"] });

    invalidate.mockClear();
    callable.mockRejectedValue(new Error("boom"));
    const second = setup();
    await expect(second.result.current.mutateAsync("m2")).rejects.toThrow("boom");
    expect(second.invalidate).toHaveBeenCalledWith({ queryKey: ["members"] });
  });
});
