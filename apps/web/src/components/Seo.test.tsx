import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Seo } from "./Seo";

describe("Seo", () => {
  afterEach(() => document.head.querySelectorAll("[data-qleaves-seo]").forEach((node) => node.remove()));

  it("sets canonical, description, Open Graph metadata and structured data", async () => {
    render(<Seo title="Plant collection" description="Shop indoor plants in Qatar." path="/shop" structuredData={{ "@type": "Organization", name: "QLeaves" }} />);
    await waitFor(() => expect(document.title).toBe("Plant collection | QLeaves"));
    expect(document.head.querySelector('link[rel="canonical"]')).toHaveAttribute("href", "https://qleaves.qa/shop");
    expect(document.head.querySelector('meta[name="description"]')).toHaveAttribute("content", "Shop indoor plants in Qatar.");
    expect(document.head.querySelector('meta[property="og:url"]')).toHaveAttribute("content", "https://qleaves.qa/shop");
    expect(document.head.querySelector('script[type="application/ld+json"]')?.textContent).toContain("Organization");
  });

  it("marks error pages noindex", async () => {
    render(<Seo title="Page not found" description="This page does not exist." path="/missing" noIndex />);
    await waitFor(() => expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute("content", "noindex, follow"));
  });
});
