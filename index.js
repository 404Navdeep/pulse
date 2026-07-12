import dotenv from "dotenv";
import logger from "./core/logger.js";
import { loadPlugins } from "./core/plugin-loader.js";

dotenv.config();

logger.info("Pulse is starting!");

const ctx = {
    logger
};

await loadPlugins(ctx);

logger.info("Pulse is ready!")