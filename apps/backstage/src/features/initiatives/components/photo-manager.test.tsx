import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Photo } from "@luminova/types";
import { Timestamp } from "firebase/firestore";
import { PhotoManager } from "./photo-manager";

const PHOTOS: Photo[] = [
  {
    id: "photo-1",
    url: "https://example.com/photo1.jpg",
    caption: "Primera foto",
    uploadedAt: Timestamp.fromDate(new Date("2024-01-01")),
    uploadedBy: "uid-1",
  },
  {
    id: "photo-2",
    url: "https://example.com/photo2.jpg",
    caption: null,
    uploadedAt: Timestamp.fromDate(new Date("2024-01-02")),
    uploadedBy: "uid-1",
  },
];

function renderManager(overrides?: {
  onUpload?: () => Promise<void>;
  onRemove?: (id: string) => Promise<void>;
  onSetCover?: (id: string) => Promise<void>;
  onSetCaption?: (id: string, caption: string) => Promise<void>;
}) {
  const onUpload = overrides?.onUpload ?? vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const onRemove =
    overrides?.onRemove ?? vi.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined);
  const onSetCover =
    overrides?.onSetCover ?? vi.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined);
  const onSetCaption =
    overrides?.onSetCaption ??
    vi.fn<(id: string, caption: string) => Promise<void>>().mockResolvedValue(undefined);

  render(
    <PhotoManager
      photos={PHOTOS}
      onUpload={onUpload}
      onRemove={onRemove}
      onSetCover={onSetCover}
      onSetCaption={onSetCaption}
    />,
  );

  return { onUpload, onRemove, onSetCover, onSetCaption };
}

describe("PhotoManager", () => {
  it("renders one img per photo", () => {
    renderManager();
    expect(screen.getByAltText("Primera foto")).toBeInTheDocument();
    expect(screen.getByAltText("Foto")).toBeInTheDocument();
    expect(screen.getAllByRole("img").filter((el) => el.tagName === "IMG")).toHaveLength(2);
  });

  it("clicking 'Hacer portada' on the second photo calls onSetCover with that photo's id", async () => {
    const user = userEvent.setup();
    const { onSetCover } = renderManager();

    const coverButton = screen.getByRole("button", { name: /hacer portada/i });
    await user.click(coverButton);

    expect(onSetCover).toHaveBeenCalledWith("photo-2");
  });

  it("the first photo shows the Portada pill and has no set-cover button visible", () => {
    renderManager();

    expect(screen.getByText("Portada")).toBeInTheDocument();

    expect(screen.queryAllByRole("button", { name: /hacer portada/i })).toHaveLength(1);

    const figures = Array.from(document.querySelectorAll("figure"));
    const firstFigure = figures[0];
    expect(firstFigure?.querySelector("button[aria-label='Hacer portada']")).toBeNull();
  });

  it("clicking 'Quitar foto' then confirming 'Sí' calls onRemove with the right id", async () => {
    const user = userEvent.setup();
    const { onRemove } = renderManager();

    await user.click(screen.getAllByRole("button", { name: /quitar foto/i })[0]!);

    const confirmButton = await screen.findByRole("button", { name: /confirmar quitar foto/i });
    await user.click(confirmButton);

    expect(onRemove).toHaveBeenCalledWith("photo-1");
  });
});
