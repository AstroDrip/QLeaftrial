import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Providers } from "../../app/providers";
import { FREE_DELIVERY_THRESHOLD_QAR, FreeDeliveryProgress, freeDeliveryProgress } from "./FreeDeliveryProgress";

describe("free delivery progress", () => {
  beforeEach(() => localStorage.removeItem("qleaves-language"));
  afterEach(() => { cleanup(); localStorage.clear(); });

  it("works out what is left and how full the track is", () => {
    expect(FREE_DELIVERY_THRESHOLD_QAR).toBe(150);
    expect(freeDeliveryProgress(0)).toEqual({ remaining: 150, percent: 0, unlocked: false });
    expect(freeDeliveryProgress(45)).toEqual({ remaining: 105, percent: 30, unlocked: false });
    expect(freeDeliveryProgress(150)).toEqual({ remaining: 0, percent: 100, unlocked: true });
    expect(freeDeliveryProgress(400)).toEqual({ remaining: 0, percent: 100, unlocked: true });
  });

  it("shows the amount still needed, the note and a filled-to-scale track", () => {
    render(<Providers><FreeDeliveryProgress subtotalQar={45} /></Providers>);

    expect(screen.getByText("Add 105 QAR more to get free delivery")).toBeInTheDocument();
    expect(screen.getByText("Free delivery on orders of 150 QAR or more")).toBeInTheDocument();
    const track = screen.getByRole("progressbar", { name: "Free delivery progress" });
    expect(track).toHaveAttribute("aria-valuenow", "30");
    expect(track.firstElementChild).toHaveStyle({ width: "30%" });
  });

  it("celebrates once the basket reaches 150 QAR", () => {
    render(<Providers><FreeDeliveryProgress subtotalQar={150} /></Providers>);

    expect(screen.getByText("You’ve unlocked free delivery!")).toBeInTheDocument();
    expect(screen.getByTestId("free-delivery")).toHaveClass("is-unlocked");
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
  });

  it("has a colour layer that runs back along the track once the goal is met", () => {
    const { rerender } = render(<Providers><FreeDeliveryProgress subtotalQar={100} /></Providers>);
    const sweep = screen.getByTestId("free-delivery-sweep");
    // Beside the track, not inside it: the track clips, and the glow has to spill out around the line.
    expect(sweep.parentElement).toBe(screen.getByRole("progressbar").parentElement);
    expect(screen.getByRole("progressbar")).not.toContainElement(sweep);
    expect(screen.getByTestId("free-delivery")).not.toHaveClass("is-unlocked");

    rerender(<Providers><FreeDeliveryProgress subtotalQar={150} /></Providers>);
    // The sweep is driven by this class (see the stylesheet), starting as the light arrives.
    expect(screen.getByTestId("free-delivery")).toHaveClass("is-unlocked");
  });

  it("is available in Arabic and has a compact form without the note", () => {
    localStorage.setItem("qleaves-language", "ar");
    render(<Providers><FreeDeliveryProgress subtotalQar={100} compact /></Providers>);

    expect(screen.getByText("أضف 50 ر.ق للحصول على توصيل مجاني")).toBeInTheDocument();
    expect(screen.queryByText(/توصيل مجاني للطلبات من/)).not.toBeInTheDocument();
    expect(screen.getByTestId("free-delivery")).toHaveClass("free-delivery--compact");
  });
});
