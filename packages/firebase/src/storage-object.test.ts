import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ref = vi.fn((_service: unknown, path: string) => ({ path }));
const uploadBytes = vi.fn(async () => undefined);
const getDownloadURL = vi.fn(async () => "https://example.test/download");
const deleteObject = vi.fn(async () => undefined);

vi.mock("firebase/storage", () => ({ ref, uploadBytes, getDownloadURL, deleteObject }));
vi.mock("./index", () => ({ getStorageService: () => ({}) }));

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("uploadObject", () => {
  it("uploads at the given path and returns the download URL", async () => {
    const { uploadObject } = await import("./storage-object");
    const blob = new Blob(["x"]);
    const url = await uploadObject("members/m1/profile.jpg", blob);
    expect(ref).toHaveBeenCalledWith(expect.anything(), "members/m1/profile.jpg");
    expect(uploadBytes).toHaveBeenCalledWith({ path: "members/m1/profile.jpg" }, blob, {
      contentType: "image/jpeg",
    });
    expect(url).toBe("https://example.test/download");
  });

  it("defaults contentType to image/jpeg", async () => {
    const { uploadObject } = await import("./storage-object");
    await uploadObject("activities/a1/photos/p1.jpg", new Blob(["x"]));
    expect(uploadBytes).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
      contentType: "image/jpeg",
    });
  });

  it("honors an explicit contentType override (ally logo case)", async () => {
    const { uploadObject } = await import("./storage-object");
    await uploadObject("allies/al1/logo", new Blob(["x"]), { contentType: "image/png" });
    expect(uploadBytes).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
      contentType: "image/png",
    });
  });

  it("preserves an empty contentType override (?? not ||, e.g. file.type === '')", async () => {
    const { uploadObject } = await import("./storage-object");
    await uploadObject("allies/al1/logo", new Blob(["x"]), { contentType: "" });
    expect(uploadBytes).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
      contentType: "",
    });
  });
});

describe("deleteObjectQuietly", () => {
  it("deletes the object at the given path", async () => {
    const { deleteObjectQuietly } = await import("./storage-object");
    await deleteObjectQuietly("members/m1/profile.jpg");
    expect(deleteObject).toHaveBeenCalledWith({ path: "members/m1/profile.jpg" });
  });

  it("swallows storage/object-not-found (orphan-tolerant)", async () => {
    deleteObject.mockRejectedValueOnce({ code: "storage/object-not-found" });
    const { deleteObjectQuietly } = await import("./storage-object");
    await expect(deleteObjectQuietly("gone/none")).resolves.toBeUndefined();
  });

  it("rethrows any other error code", async () => {
    deleteObject.mockRejectedValueOnce({ code: "storage/unauthorized" });
    const { deleteObjectQuietly } = await import("./storage-object");
    await expect(deleteObjectQuietly("blocked/x")).rejects.toEqual({
      code: "storage/unauthorized",
    });
  });
});
