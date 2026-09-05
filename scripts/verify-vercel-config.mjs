import { access, readFile } from "node:fs/promises";

const config = JSON.parse(
  await readFile(new URL("../vercel.json", import.meta.url), "utf8"),
);

const packageJson = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);

const problems = [];

if (packageJson.type !== "module") {
  problems.push(
    'Root package.json must set "type": "module" so the Vercel function can import the ESM Express app',
  );
}
if (config.$schema !== "https://openapi.vercel.sh/vercel.json") {
  problems.push("vercel.json must use the current Vercel schema URL");
}
if (config.buildCommand !== "npm run vercel-build") {
  problems.push("Vercel buildCommand must call npm run vercel-build");
}
if (!packageJson.scripts?.["vercel-build"]?.includes("verify-vercel-env.mjs")) {
  problems.push("Vercel build must validate the production runtime environment");
}
if (config.outputDirectory !== "apps/web/dist") {
  problems.push("Vercel outputDirectory must be apps/web/dist");
}
const rewrites = Array.isArray(config.rewrites) ? config.rewrites : [];
const apiRewrite = rewrites.findIndex((route) => route.source === "/api/v1/:path*" && route.destination === "/api/index");
const sitemapRewrite = rewrites.findIndex((route) => route.source === "/sitemap.xml" && route.destination === "/api/index");
const spaRewrite = rewrites.findIndex((route) => route.destination === "/index.html");
if (apiRewrite < 0) problems.push("Missing /api/v1/* rewrite to the Express function");
if (sitemapRewrite < 0) problems.push("Missing /sitemap.xml rewrite to the Express function");
if (spaRewrite < 0) problems.push("Missing SPA fallback to index.html");
if (spaRewrite >= 0 && !String(rewrites[spaRewrite].source).includes("?!api/")) {
  problems.push("SPA fallback must explicitly exclude /api requests");
}
if (apiRewrite >= 0 && spaRewrite >= 0 && apiRewrite > spaRewrite) {
  problems.push("API rewrite must be evaluated before the SPA fallback");
}
if (sitemapRewrite >= 0 && spaRewrite >= 0 && sitemapRewrite > spaRewrite) {
  problems.push("Sitemap rewrite must be evaluated before the SPA fallback");
}

try {
  await access(new URL("../apps/web/public/sitemap.xml", import.meta.url));
  problems.push("Static sitemap.xml must not shadow the dynamic sitemap route");
} catch {
  // Absence is required: the Express route owns /sitemap.xml.
}
const fn = config.functions?.["api/index.ts"];
if (!fn || typeof fn.maxDuration !== "number" || !fn.includeFiles) {
  problems.push("api/index.ts must declare maxDuration and includeFiles for Prisma assets");
}

const globalHeaders = (Array.isArray(config.headers) ? config.headers : [])
  .find((entry) => entry.source === "/(.*)")?.headers ?? [];
const reportOnlyCsp = globalHeaders.find(
  (header) => header.key === "Content-Security-Policy-Report-Only",
)?.value;
if (!reportOnlyCsp) {
  problems.push("Missing Content-Security-Policy-Report-Only header");
} else {
  for (const directive of [
    "default-src 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "report-uri /api/v1/security/csp-report",
  ]) {
    if (!reportOnlyCsp.includes(directive)) {
      problems.push(`Report-only CSP must include: ${directive}`);
    }
  }
}

if (problems.length) {
  console.error(problems.map((problem) => `- ${problem}`).join("\n"));
  process.exit(1);
}

console.log("Vercel configuration smoke check passed");
