import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const callable = vi.fn();
vi.mock("firebase/functions", () => ({ httpsCallable: () => callable }));
vi.mock("@luminova/firebase/functions", () => ({ getFunctionsService: () => ({}) }));
vi.mock("../../../lib/auth/request-password-reset", () => ({
  requestPasswordReset: vi.fn().mockResolvedValue(undefined),
}));

import { requestPasswordReset } from "../../../lib/auth/request-password-reset";
import { useProvisionMemberLogin } from "./use-provision-member-login";

const mockedReset = vi.mocked(requestPasswordReset);

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
  const hook = renderHook(() => useProvisionMemberLogin(), { wrapper: wrapper(client) });
  return { ...hook, client, invalidate };
}

describe("useProvisionMemberLogin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedReset.mockResolvedValue(undefined);
    callable.mockResolvedValue({
      data: { email: "ana@jci.bo", actionLink: "https://example.com/link" },
    });
  });

  it("provisions, then mails the member — and withholds the link that mail invalidated", async () => {
    const { result } = setup();
    const invite = await result.current.mutateAsync("m1");
    expect(callable).toHaveBeenCalledWith({ memberId: "m1" });
    expect(mockedReset).toHaveBeenCalledWith("ana@jci.bo");
    // Firebase keeps only the most recent password-reset oobCode valid, so the mail above
    // killed `actionLink`. Offering it as "por si no le llega" would hand the operator a link
    // that fails with auth/invalid-action-code.
    expect(invite).toEqual({
      email: "ana@jci.bo",
      emailSent: true,
      fallbackLink: null,
      mailError: null,
    });
  });

  it("surfaces the link only when the mail did NOT go out", async () => {
    mockedReset.mockRejectedValue(new Error("network error"));
    const { result } = setup();
    const invite = await result.current.mutateAsync("m1");
    expect(invite.emailSent).toBe(false);
    expect(invite.fallbackLink).toBe("https://example.com/link");
    expect(invite.mailError).toBe("network error");
  });

  it("does not reject when only the mail fails: the account exists and the uid is linked", async () => {
    mockedReset.mockRejectedValue(new Error("network error"));
    const { result } = setup();
    await expect(result.current.mutateAsync("m1")).resolves.toBeDefined();
  });

  // BLOCKING — the regression this hook was restructured for. The mail used to be sent from a
  // component-scoped `provision.mutate(id, { onSuccess })`, and TanStack Query v5 runs those
  // callbacks only while the observer still `hasListeners()`. An operator who navigated away
  // (or, on the profile page, merely switched members — InviteAccess is keyed by member id)
  // got the Auth account created and the uid linked with NO mail ever sent and no error
  // anywhere. `mutationFn` has no such condition.
  it("BLOCKING: sends the mail even when the caller unmounts before the callable resolves", async () => {
    let resolveCallable: (v: unknown) => void = () => {};
    callable.mockReturnValue(
      new Promise((resolve) => {
        resolveCallable = resolve;
      }),
    );
    const { result, unmount } = setup();
    result.current.mutate("m1");
    unmount();
    resolveCallable({ data: { email: "ana@jci.bo", actionLink: "https://example.com/link" } });
    await waitFor(() => expect(mockedReset).toHaveBeenCalledWith("ana@jci.bo"));
  });

  // beacon writes members/{id}.uid. Without this the cached member keeps `uid: undefined` for
  // the 5-minute default staleTime, so the invite button neither disappears nor relabels and a
  // second click 403s on the adoption guard.
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
