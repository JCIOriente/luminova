import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ImageUploader } from "./image-uploader";

describe("ImageUploader", () => {
  it("rejects a non-image and does not call onUpload", async () => {
    const onUpload = vi.fn();
    render(<ImageUploader currentSrc={null} name="Ana" onUpload={onUpload} onRemove={vi.fn()} />);
    const input = screen.getByTestId("image-file-input") as HTMLInputElement;
    const bad = new File([new Uint8Array(4)], "a.pdf", { type: "application/pdf" });
    fireEvent.change(input, { target: { files: [bad] } });
    await waitFor(() => expect(screen.getByText(/imagen válida|valid image/i)).toBeInTheDocument());
    expect(onUpload).not.toHaveBeenCalled();
  });
});
