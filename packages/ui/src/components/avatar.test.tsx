import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Avatar } from "./avatar";

describe("Avatar", () => {
  it("renders the photo when src is provided", () => {
    render(<Avatar src="https://x/y.jpg" name="Ana Lopez" />);
    expect(screen.getByRole("img")).toHaveAttribute("src", "https://x/y.jpg");
  });
  it("falls back to initials when src is null", () => {
    render(<Avatar src={null} name="Ana Lopez" />);
    expect(screen.getByText("AL")).toBeInTheDocument();
  });
});
