import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { HeroParticles, createField } from "./HeroParticles";

describe("hero particles", () => {
  afterEach(cleanup);

  it("makes a field of leaves, each with its own fixed tilt, inside the same field as before", () => {
    const field = createField();
    expect(field).toHaveLength(90);
    for (const leaf of field) {
      expect(Math.abs(leaf.x)).toBeLessThanOrEqual(11);
      expect(Math.abs(leaf.y)).toBeLessThanOrEqual(8);
      expect(Math.abs(leaf.z)).toBeLessThanOrEqual(6);
      expect(leaf.tilt).toBeGreaterThanOrEqual(0);
      expect(leaf.tilt).toBeLessThan(Math.PI * 2);
    }
    expect(new Set(field.map((leaf) => leaf.tilt.toFixed(3))).size).toBeGreaterThan(60);
  });

  it("is a decorative canvas that assistive technology skips", () => {
    const { container } = render(<HeroParticles />);
    const canvas = container.querySelector("canvas");
    expect(canvas).toHaveAttribute("aria-hidden", "true");
  });
});
