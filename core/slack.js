import { App } from "@slack/bolt";
import logger from "./logger.js"
import { homeView } from "./ui/home.js";

let app = null;

export async function initSlack() {

    app = new App({
        token: process.env.SLACKBTOKEN,
        appToken: process.env.SLACKATOKEN,
        socketMode: true
    });
    app.event("app_home_opened", async ({ event, client }) => {
        await client.views.publish({
            user_id: event.user,
            view: homeView({
                enabled: false
            })
        });
    });

    await app.start();

    logger.info("Connected to Slack")
    return app;
}

export function getSlack() {
    return app;
}