import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// Browser APIs absent in jsdom, used by Radix popovers and selects.
HTMLElement.prototype.scrollIntoView = vi.fn();
HTMLElement.prototype.hasPointerCapture = () => false;
HTMLElement.prototype.setPointerCapture = vi.fn();
HTMLElement.prototype.releasePointerCapture = vi.fn();
vi.stubGlobal("ResizeObserver", class {
  observe() {}
  unobserve() {}
  disconnect() {}
});
