const EIGHT_BALL_RESPONSES = [
    "It is certain",
    "Without a doubt",
    "Definitely",
    "You can count on it",
    "Signs point to yes",
    "Most likely",
    "Looks good",
    "Probably",
    "Ask again later",
    "I crave more info",
    "Dont count on it",
    "My sources say no",
    "Very doubt full",
    "Absolutely not",
    "Bro, hell naww",
    ":sk:",
    "Not my problem",
    "I'd rather not anser that",
    "No comment"
];

export default {
    id: "games",
    name: "Games",
    version: "0.1.0",
    
    async init(ctx) {
        ctx.slack.app.event(
            "app_mention",
            async ({ event, client }) => {
                try {
                    const input =
                        cleanMention(event.text)
                    if (!input) {
                        return;
                    }
                    const parts = input.split(/\s+/);
                    const game =  parts.shift()?.toLowerCase();
                    if (!game) {
                        return;
                    }
                    const args = parts.join(" ").trim();
                    const threadTs = event.thread_ts || event.ts;
                    switch (game) {
                        case "!8ball":
                            await handle8ball(
                                args,
                                client,
                                event.channel,
                                threadTs
                            );
                            break;
                        default:
                            return;
                    }
                    ctx.logger.info(`Game ${game} played by ${event.user}`);

                } catch (error) {
                    ctx.logger.error({
                        error: {
                            message: error.message,
                            stack: error.stack
                        }
                    },"Game failed");
                }
            }
        );
        ctx.logger.info("Games initialized");
    }
};

async function handle8ball(
    question,
    client,
    channel,
    threadTs
) {
    if (!question) {
        await client.chat.postMessage({
            channel,
            thread_ts: threadTs,

            text: ":8ball: Ask me an actual question, vro"
        });
        return;
    }

    const answer = EIGHT_BALL_RESPONSES[Math.floor(
        Math.random() *
        EIGHT_BALL_RESPONSES.length
    )];

    await client.chat.postMessage({
        channel,
        thread_ts: threadTs,
        text: `:8ball: *The 8-ball says:*\n${answer}`
    });
}

function cleanMention(text) {
    if (!text) {
        return "";
    }
    return text
        .replace(/<@[A-Z0-9]+>/g, "")
        .trim();
}