import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { LogoUploader } from "./logo-uploader";

function pngFile(size = 100) {
  return new File([new Uint8Array(size)], "logo.png", { type: "image/png" });
}

describe("LogoUploader", () => {
  it("uploads a valid png", async () => {
    const onUpload = vi.fn().mockResolvedValue(undefined);
    render(<LogoUploader currentSrc={null} onUpload={onUpload} onRemove={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/logo/i), { target: { files: [pngFile()] } });
    await waitFor(() => expect(onUpload).toHaveBeenCalledOnce());
  });

  it("rejects a non-image file", async () => {
    const onUpload = vi.fn();
    render(<LogoUploader currentSrc={null} onUpload={onUpload} onRemove={vi.fn()} />);
    const pdf = new File([new Uint8Array(10)], "x.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText(/logo/i), { target: { files: [pdf] } });
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(onUpload).not.toHaveBeenCalled();
  });

  it("rejects a file over 2 MB", async () => {
    const onUpload = vi.fn();
    render(<LogoUploader currentSrc={null} onUpload={onUpload} onRemove={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/logo/i), {
      target: { files: [pngFile(2 * 1024 * 1024 + 1)] },
    });
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(onUpload).not.toHaveBeenCalled();
  });
});
