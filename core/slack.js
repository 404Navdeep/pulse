import { App } from "@slack/bolt";
import { WebClient } from "@slack/web-api";

export async function createSlack() {
    const app = new App({
        token: process.env.SLACK_BOT_TOKEN,
        appToken: process.env.SLACK_APP_TOKEN,
        socketMode: true
    });

    const userClient = new WebClient(
        process.env.SLACK_USER_TOKEN
    );

    const botClient = new WebClient(
        process.env.SLACK_BOT_TOKEN
    );

    return {
        app,
        userClient,
        botClient
    };
}