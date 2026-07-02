import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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

  it("pressing Enter in the caption input commits exactly once", async () => {
    const user = userEvent.setup();
    const { onSetCaption } = renderManager();

    const editButtons = screen.getAllByRole("button", { name: /editar descripción/i });
    await user.click(editButtons[0]!);

    const input = await screen.findByRole("textbox", { name: /editar descripción/i });
    await user.clear(input);
    await user.type(input, "Nueva");
    await user.keyboard("{Enter}");

    expect(onSetCaption).toHaveBeenCalledTimes(1);
    expect(onSetCaption).toHaveBeenCalledWith("photo-1", "Nueva");
  });

  it("pressing Escape in the caption input cancels without saving", async () => {
    const user = userEvent.setup();
    const { onSetCaption } = renderManager();

    const editButtons = screen.getAllByRole("button", { name: /editar descripción/i });
    await user.click(editButtons[0]!);

    const input = await screen.findByRole("textbox", { name: /editar descripción/i });
    await user.type(input, " extra");
    await user.keyboard("{Escape}");

    expect(onSetCaption).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox", { name: /editar descripción/i })).not.toBeInTheDocument();
  });

  it("confirm-remove cancel flow: Cancelar suppresses onRemove, Quitar remains clickable", async () => {
    const user = userEvent.setup();
    const { onRemove } = renderManager();

    const quitarButtons = screen.getAllByRole("button", { name: /quitar foto/i });
    await user.click(quitarButtons[0]!);

    const cancelButton = await screen.findByRole("button", { name: /cancelar quitar foto/i });
    await user.click(cancelButton);

    expect(onRemove).not.toHaveBeenCalled();

    const quitarButtonsAfter = screen.getAllByRole("button", { name: /quitar foto/i });
    await user.click(quitarButtonsAfter[0]!);
    const confirmButton = await screen.findByRole("button", { name: /confirmar quitar foto/i });
    await user.click(confirmButton);

    expect(onRemove).toHaveBeenCalledWith("photo-1");
  });
});

describe("PhotoManager failed writes", () => {
  it("keeps the caption editor open and preserves the typed value when the write rejects", async () => {
    const user = userEvent.setup();
    renderManager({
      onSetCaption: vi
        .fn<(id: string, caption: string) => Promise<void>>()
        .mockRejectedValue(new Error("denied")),
    });

    await user.click(screen.getAllByRole("button", { name: /editar descripción/i })[0]!);
    const input = await screen.findByRole("textbox", { name: /editar descripción/i });
    await user.clear(input);
    await user.type(input, "Nuevo texto");
    await user.keyboard("{Enter}");

    // No optimistic close: the editor stays open with the user's text intact.
    const stillOpen = await screen.findByRole("textbox", { name: /editar descripción/i });
    expect(stillOpen).toHaveValue("Nuevo texto");
  });

  it("closes the caption editor when the write succeeds", async () => {
    const user = userEvent.setup();
    renderManager();

    await user.click(screen.getAllByRole("button", { name: /editar descripción/i })[0]!);
    const input = await screen.findByRole("textbox", { name: /editar descripción/i });
    await user.type(input, " editada");
    await user.keyboard("{Enter}");

    await waitFor(() =>
      expect(
        screen.queryByRole("textbox", { name: /editar descripción/i }),
      ).not.toBeInTheDocument(),
    );
  });

  it("keeps the remove confirm open when the remove write rejects", async () => {
    const user = userEvent.setup();
    renderManager({
      onRemove: vi.fn<(id: string) => Promise<void>>().mockRejectedValue(new Error("denied")),
    });

    await user.click(screen.getAllByRole("button", { name: /quitar foto/i })[0]!);
    await user.click(await screen.findByRole("button", { name: /confirmar quitar foto/i }));

    // The photo wasn't removed, so the confirm must stay for a retry.
    expect(
      await screen.findByRole("button", { name: /confirmar quitar foto/i }),
    ).toBeInTheDocument();
  });
});
