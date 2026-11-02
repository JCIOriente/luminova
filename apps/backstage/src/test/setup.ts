import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// cmdk/Radix rely on a few browser APIs jsdom lacks.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
if (!("ResizeObserver" in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
// Radix Popover dismiss layer uses PointerEvent capture APIs jsdom omits.
Element.prototype.hasPointerCapture = () => false;
Element.prototype.setPointerCapture = () => {};
Element.prototype.releasePointerCapture = () => {};

// Components call useRoles() and friends, and a test that doesn't mock them would reach real
// Firestore. Vitest fails a passing run if the late reply logs while a worker closes, so these
// requests never settle: rejecting would still log after the test.
const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = input instanceof Request ? input.url : String(input);
  if (url.startsWith("https://firestore.googleapis.com/")) return new Promise(() => {});
  return realFetch(input, init);
};

afterEach(() => {
  cleanup();
});
