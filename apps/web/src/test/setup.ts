import "@testing-library/jest-dom/vitest";

// jsdom does not implement scrolling.
window.scrollTo = () => undefined;

// jsdom has no canvas; components treat a null context as "not supported".
HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
