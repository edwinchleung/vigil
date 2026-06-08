/**
 * Runs only for `bun test` (Bun’s built-in runner). Mimics Vitest jsdom + vitest.setup.ts
 * so component tests using @testing-library/react match `bun run test` behavior.
 */
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
});

const { window } = dom;

Object.assign(globalThis, {
  window,
  document: window.document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  Node: window.Node,
  Text: window.Text,
  DocumentFragment: window.DocumentFragment,
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

await import("@testing-library/jest-dom/vitest");
