import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AvatarStack } from "./avatar-stack";

const people = [
  { name: "Ana Pérez", src: null },
  { name: "Beto Ruiz", src: null },
  { name: "Caro Díaz", src: null },
  { name: "Dani Soto", src: null },
  { name: "Eva Lima", src: null },
];

describe("AvatarStack", () => {
  it("renders at most `max` avatars and a +N overflow chip", () => {
    render(<AvatarStack people={people} max={3} />);
    expect(screen.getByText("+2")).toBeInTheDocument();
    expect(screen.getByLabelText("2 más: Dani Soto, Eva Lima")).toBeInTheDocument();
  });

  it("renders no overflow chip when within max", () => {
    render(<AvatarStack people={people.slice(0, 2)} max={3} />);
    expect(screen.queryByText(/^\+/)).not.toBeInTheDocument();
  });

  it("renders nothing for an empty roster", () => {
    const { container } = render(<AvatarStack people={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
