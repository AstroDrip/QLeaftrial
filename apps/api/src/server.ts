// Local development only: read apps/api/.env if it exists (it is ignored by Git). Vercel sets its own variables
// and never runs this file.
try { process.loadEnvFile(".env"); } catch { /* no local .env: nothing to load */ }

const { createApp } = await import("./app.js");
const { config } = await import("./config.js");

createApp().listen(config.port, () => {
  console.log(`QLeaves API listening on http://localhost:${config.port}`);
});
