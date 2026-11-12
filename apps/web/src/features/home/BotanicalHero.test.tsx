import { cleanup, render, screen } from "@testing-library/react";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { BotanicalHero, HERO_PHOTO } from "./BotanicalHero";

const copy = { eyebrow: "Plants delivered across Qatar", title: "For the love of art and plants.", lead: "Hand-picked plants.", cta: "Shop plants" };

describe("BotanicalHero", () => {
  afterEach(cleanup);

  it("shows the headline, text and Shop now over the room photograph, with its size reserved", () => {
    const { container } = render(<MemoryRouter><BotanicalHero copy={copy} /></MemoryRouter>);
    expect(screen.getByRole("heading", { level: 1, name: copy.title })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Shop plants" })).toHaveAttribute("href", "/shop");
    const photo = container.querySelector("img")!;
    expect(photo).toHaveAttribute("alt", "");
    expect(photo).toHaveAttribute("width", "1376");
    expect(photo).toHaveAttribute("height", "768");
    expect(container.querySelector("source")).toHaveAttribute("srcset", HERO_PHOTO.small);
  });

  it("ships both sizes of the hero photograph", () => {
    // Built with node:path: Vite rewrites new URL(..., import.meta.url) into a web asset URL.
    for (const url of [HERO_PHOTO.large, HERO_PHOTO.small]) {
      expect(existsSync(resolve(dirname(fileURLToPath(import.meta.url)), "../../../public", `.${url}`)), url).toBe(true);
    }
  });
});
