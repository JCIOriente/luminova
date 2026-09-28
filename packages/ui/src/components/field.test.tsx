// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Field } from "./field";
import { Input } from "./input";
import { Textarea } from "./textarea";
import { Select } from "./select";
import { Combobox } from "./combobox";
import { DatePicker } from "./date-picker";

afterEach(cleanup);

describe("Field wires its control's aria from label/hint/error", () => {
  it("points an erroring control at the error and marks it invalid", () => {
    render(
      <Field label="Correo" htmlFor="email" error="Correo inválido.">
        <Input id="email" />
      </Field>,
    );
    const input = screen.getByLabelText("Correo");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBe("email-err");
    expect(document.getElementById("email-err")?.textContent).toContain("Correo inválido.");
  });

  it("describes a valid control by its hint, and leaves it not-invalid", () => {
    render(
      <Field label="Enlace" htmlFor="url" hint="Se abre al tocar.">
        <Input id="url" />
      </Field>,
    );
    const input = screen.getByLabelText("Enlace");
    expect(input.getAttribute("aria-invalid")).toBeNull();
    expect(input.getAttribute("aria-describedby")).toBe("url-hint");
    expect(document.getElementById("url-hint")?.textContent).toBe("Se abre al tocar.");
  });

  it("announces a required field as required", () => {
    render(
      <Field label="Nombre" htmlFor="name" required>
        <Input id="name" />
      </Field>,
    );
    expect(screen.getByLabelText(/Nombre/).getAttribute("aria-required")).toBe("true");
  });

  it("merges a caller's own describedby and lets an explicit aria-invalid win", () => {
    render(
      <Field label="Nombre" htmlFor="name" error="Requerido.">
        <Input id="name" aria-describedby="note" aria-invalid={false} />
      </Field>,
    );
    const input = screen.getByLabelText("Nombre");
    expect(input.getAttribute("aria-describedby")).toBe("note name-err");
    expect(input.getAttribute("aria-invalid")).toBe("false");
  });

  it("does not announce a hand-wired error id twice", () => {
    render(
      <Field label="Nombre" htmlFor="name" error="Requerido.">
        <Input id="name" aria-describedby="name-err" />
      </Field>,
    );
    expect(screen.getByLabelText("Nombre").getAttribute("aria-describedby")).toBe("name-err");
  });

  it("reaches Textarea and Select too", () => {
    render(
      <>
        <Field label="Mensaje" htmlFor="msg" error="Requerido.">
          <Textarea id="msg" />
        </Field>
        <Field label="Estado" htmlFor="st" error="Requerido.">
          <Select id="st" />
        </Field>
      </>,
    );
    expect(screen.getByLabelText("Mensaje").getAttribute("aria-describedby")).toBe("msg-err");
    expect(screen.getByLabelText("Estado").getAttribute("aria-invalid")).toBe("true");
  });

  it("describes a picker trigger by the error without claiming aria-invalid on a button", () => {
    render(
      <>
        <Field label="Director" htmlFor="dir" error="Requerido.">
          <Combobox id="dir" options={[]} value={null} onChange={() => {}} />
        </Field>
        <Field label="Inicio" htmlFor="start" error="Requerido.">
          <DatePicker id="start" value="" onChange={() => {}} />
        </Field>
      </>,
    );
    const combo = document.getElementById("dir");
    const date = document.getElementById("start");
    expect(combo?.getAttribute("aria-describedby")).toBe("dir-err");
    expect(date?.getAttribute("aria-describedby")).toBe("start-err");
    expect(combo?.getAttribute("aria-invalid")).toBeNull();
  });

  it("leaves a control outside any Field untouched", () => {
    render(<Input aria-label="Suelto" />);
    const input = screen.getByLabelText("Suelto");
    expect(input.getAttribute("aria-describedby")).toBeNull();
    expect(input.getAttribute("aria-required")).toBeNull();
  });
});
