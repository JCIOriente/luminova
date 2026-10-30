import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LogoLockup } from "./logo-lockup";

describe("LogoLockup", () => {
  it("names the brand and reserves the logo's real aspect ratio", () => {
    render(<LogoLockup />);
    const logo = screen.getByRole("img", { name: "JCI Ejemplo" });
    expect(logo).toHaveAttribute("width", "400");
    expect(logo).toHaveAttribute("height", "200");
  });

  it("serves a different file per variant from the brand profile", () => {
    render(
      <>
        <LogoLockup />
        <LogoLockup variant="inverted" />
        <LogoLockup variant="on-blue" />
      </>,
    );
    const sources = screen.getAllByRole("img").map((img) => img.getAttribute("src"));
    expect(sources).toEqual([
      expect.stringMatching(/brand\/example\/assets\/logo-main\.png$/),
      expect.stringMatching(/brand\/example\/assets\/logo-on-dark\.png$/),
      expect.stringMatching(/brand\/example\/assets\/logo-on-primary\.png$/),
    ]);
  });
});
