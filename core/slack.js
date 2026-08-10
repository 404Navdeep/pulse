import { App } from "@slack/bolt";

export async function createSlack() {
    const app = new App({
        token: process.env.SLACK_BOT_TOKEN,
        appToken: process.env.SLACK_APP_TOKEN,
        socketMode: true
    });
    return app;
}