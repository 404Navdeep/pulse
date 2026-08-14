import "dotenv/config";
import logger from "./core/logger.js";
import { createApp } from "./core/app.js";

logger.info("Starting Pulse...");

const app = await createApp();

await app.start();