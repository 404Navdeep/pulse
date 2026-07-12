import dotenv from "dotenv";
import logger from "./core/logger.js";
import { loadPlugins } from "./core/plugin-loader.js";
import events from "./core/event-bus.js";

dotenv.config();

logger.info("Pulse is starting!");

const ctx = {
    logger,
    events
};

await loadPlugins(ctx);

logger.info("Pulse is ready!");

events.emitEvent("app.ready");