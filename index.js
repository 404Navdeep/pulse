import dotenv from "dotenv";
import logger from "./core/logger.js";
import { loadPlugins } from "./core/plugin-loader.js";
import events from "./core/event-bus.js";
import { initSlack } from "./core/slack.js";
import state from "./core/state.js";

dotenv.config();

logger.info("Pulse is starting!");
const slack = await initSlack();

const ctx = {
    logger,
    events,
    slack,
    state
};

ctx.slack = slack;

await loadPlugins(ctx);

logger.info("Pulse is ready!");

events.emitEvent("app.ready");