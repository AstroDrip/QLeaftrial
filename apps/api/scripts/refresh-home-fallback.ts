// Refreshes the committed fallback for the homepage bootstrap (apps/web/bootstrap/home-fallback.json) from the
// public catalogue. The build normally cuts the bootstrap from the database; this file is what a build uses when
// the database cannot be reached, so a release never ships without homepage data. It reads public data only.
//
//   npm run home:fallback -w @qleaves/api                 (from https://qleaves.qa)
//   npm run home:fallback -w @qleaves/api -- <catalogue url>
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildHomeBootstrap, isHomeBootstrap } from "../src/lib/home-bootstrap.js";

const url = process.argv[2] ?? "https://qleaves.qa/api/v1/catalogue";
const output = resolve(dirname(fileURLToPath(import.meta.url)), "../../web/bootstrap/home-fallback.json");

const response = await fetch(url, { headers: { Accept: "application/json" } });
if (!response.ok) throw new Error(`Catalogue request failed (${response.status})`);
const catalogue = await response.json() as Parameters<typeof buildHomeBootstrap>[0];
const bootstrap = buildHomeBootstrap(catalogue);
if (!isHomeBootstrap(bootstrap)) throw new Error("The catalogue did not produce a usable homepage bootstrap");

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(bootstrap)}\n`, "utf8");
console.log(`Homepage fallback: ${bootstrap.products.length} products, version ${bootstrap.version} (${output})`);
