import { createApp } from "./app";
import { config } from "./config";

createApp().listen(config.port, () => {
  console.log(`QLeaves API listening on http://localhost:${config.port}`);
});
