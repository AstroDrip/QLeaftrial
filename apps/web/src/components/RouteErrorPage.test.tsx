import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  attemptStaleChunkRecovery,
  isStaleChunkError,
  RouteErrorContent,
} from "./RouteErrorPage";

describe("stale deployment recovery", () => {
  it("recognizes a failed Vite dynamic chunk request", () => {
    expect(isStaleChunkError(new TypeError(
      "Failed to fetch dynamically imported module: https://qleaves.qa/assets/CartPage-old.js",
    ))).toBe(true);
    expect(isStaleChunkError(new Error("Product request failed"))).toBe(false);
  });

  it("reloads once for the same missing chunk", () => {
    const error = new TypeError(
      "Failed to fetch dynamically imported module: https://qleaves.qa/assets/CartPage-old.js",
    );
    const storage = new Map<string, string>();
    const session = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    };
    const reload = vi.fn();

    expect(attemptStaleChunkRecovery(error, session, reload)).toBe(true);
    expect(attemptStaleChunkRecovery(error, session, reload)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("renders a branded recovery action instead of the router developer page", () => {
    render(<RouteErrorContent error={new Error("ordinary route failure")} />);

    expect(screen.getByRole("heading", { name: "Something went wrong" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh QLeaves" })).toBeInTheDocument();
  });
});
