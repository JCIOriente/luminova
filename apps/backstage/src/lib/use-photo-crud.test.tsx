import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { usePhotoCrud, type PhotoSource } from "./use-photo-crud";

vi.mock("../features/members/hooks/use-current-member", () => ({
  useCurrentMember: () => ({ data: { id: "member-1" } }),
}));

function makeRepo() {
  return {
    addPhoto: vi.fn(async () => undefined),
    removePhoto: vi.fn(async () => undefined),
    setCover: vi.fn(async () => undefined),
    setCaption: vi.fn(async () => undefined),
  };
}

// Two distinct, non-colliding key sets mirroring the real domains.
const activityKeys = [
  ["activities", "detail", "a1"],
  ["activities", "term", "t1"],
] as const;
const initiativeKeys = [
  ["projects", "term", "t1"],
  ["initiatives", "detail", "Project", "i1"],
] as const;

function renderPhotoCrud(source: PhotoSource) {
  const client = new QueryClient();
  const invalidate = vi.spyOn(client, "invalidateQueries").mockResolvedValue(undefined);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { invalidate, ...renderHook(() => usePhotoCrud(source), { wrapper }) };
}

describe("usePhotoCrud", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    { name: "activity", id: "a1", keys: activityKeys, label: "orphan activity photo" },
    { name: "initiative", id: "i1", keys: initiativeKeys, label: "orphan initiative photo" },
  ])("$name source round-trips addPhoto through the one hook", async ({ id, keys, label }) => {
    const repo = makeRepo();
    const uploadPhoto = vi.fn(async () => "https://example.test/x.jpg");
    const deletePhoto = vi.fn(async () => undefined);
    const source: PhotoSource = {
      id,
      repo,
      uploadPhoto,
      deletePhoto,
      invalidationKeys: keys,
      orphanLabel: label,
    };
    const blob = new Blob(["x"]);
    const { result, invalidate } = renderPhotoCrud(source);

    await act(async () => {
      await result.current.addPhoto(blob, "cap");
    });

    expect(uploadPhoto).toHaveBeenCalledWith(expect.any(String), blob);
    expect(repo.addPhoto).toHaveBeenCalledWith(
      id,
      expect.objectContaining({
        url: "https://example.test/x.jpg",
        caption: "cap",
        uploadedBy: "member-1",
      }),
    );
    // invalidates exactly this source's keys, in isolation
    for (const key of keys) {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: key });
    }
    expect(invalidate).toHaveBeenCalledTimes(keys.length);
  });

  it("removePhotoById repo-removes, storage-deletes, and stays orphan-tolerant on not-found", async () => {
    const repo = makeRepo();
    const uploadPhoto = vi.fn(async () => "u");
    const deletePhoto = vi.fn(async () => {
      throw { code: "storage/object-not-found" };
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const source: PhotoSource = {
      id: "a1",
      repo,
      uploadPhoto,
      deletePhoto,
      invalidationKeys: activityKeys,
      orphanLabel: "orphan activity photo",
    };
    const { result, invalidate } = renderPhotoCrud(source);

    await act(async () => {
      await expect(result.current.removePhotoById("ph1")).resolves.toBeUndefined();
    });

    expect(repo.removePhoto).toHaveBeenCalledWith("a1", "ph1");
    expect(deletePhoto).toHaveBeenCalledWith("ph1");
    expect(warn).toHaveBeenCalledWith("orphan activity photo", "a1", "ph1", expect.anything());
    expect(invalidate).toHaveBeenCalledTimes(activityKeys.length);
    warn.mockRestore();
  });

  it("setCover and setCaption delegate to the repo and invalidate", async () => {
    const repo = makeRepo();
    const source: PhotoSource = {
      id: "i1",
      repo,
      uploadPhoto: vi.fn(async () => "u"),
      deletePhoto: vi.fn(async () => undefined),
      invalidationKeys: initiativeKeys,
      orphanLabel: "orphan initiative photo",
    };
    const { result, invalidate } = renderPhotoCrud(source);

    await act(async () => {
      await result.current.setCover("ph1");
      await result.current.setCaption("ph1", "hello");
    });

    expect(repo.setCover).toHaveBeenCalledWith("i1", "ph1");
    expect(repo.setCaption).toHaveBeenCalledWith("i1", "ph1", "hello");
    // two ops (setCover + setCaption), each fanning out over the source's keys
    expect(invalidate).toHaveBeenCalledTimes(initiativeKeys.length * 2);
  });
});
