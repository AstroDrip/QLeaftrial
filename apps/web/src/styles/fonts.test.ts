import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const read = (path: string) => readFileSync(resolve(here, path), "utf8");

// The storefront's look must not depend on another company's servers: typefaces ship with the site.
describe("self-hosted typefaces", () => {
  const css = read("./fonts.css");

  it("asks no outside service for fonts or styles", () => {
    const page = read("../../index.html");
    for (const source of [page, css, read("./tokens.css"), read("./global.css")]) {
      expect(source).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/);
      expect(source).not.toMatch(/@import\s+url\(\s*["']?https?:/);
    }
    const policy = read("../../../../vercel.json");
    expect(policy).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/);
  });

  it("declares every weight the site uses for each typeface, from files that exist", () => {
    const faces = [...css.matchAll(/@font-face \{([^}]*)\}/g)].map(([, body]) => ({
      family: /font-family: "([^"]+)"/.exec(body)?.[1],
      style: /font-style: (\w+)/.exec(body)?.[1],
      weight: Number(/font-weight: (\d+);/.exec(body)?.[1]),
      file: /url\("\.\/fonts\/([^"]+)"\)/.exec(body)?.[1],
      swap: /font-display: swap/.test(body),
    }));
    const weights = (family: string, style: string) => [...new Set(faces.filter((face) => face.family === family && face.style === style).map((face) => face.weight))].sort();
    expect(weights("Archivo", "normal")).toEqual([400, 500, 600, 700, 800]);
    expect(weights("Fraunces", "normal")).toEqual([400, 500, 600]);
    expect(weights("Fraunces", "italic")).toEqual([400]);
    expect(weights("Noto Sans Arabic", "normal")).toEqual([400, 600, 700]);
    for (const face of faces) {
      expect(face.swap, face.file).toBe(true);
      expect(existsSync(resolve(here, "fonts", String(face.file))), face.file).toBe(true);
    }
    expect(existsSync(resolve(here, "fonts", "OFL.txt"))).toBe(true);
  });

  it("uses the same family names the stylesheets ask for", () => {
    const tokens = read("./tokens.css");
    for (const family of ["Fraunces", "Archivo", "Noto Sans Arabic"]) {
      expect(tokens).toContain(`"${family}"`);
      expect(css).toContain(`font-family: "${family}";`);
    }
  });
});
