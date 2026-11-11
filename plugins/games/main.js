import OpenAI from "openai";
import { COLORS, card, notice, section, context, footer, esc } from "../../core/ui.js";

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
        const openai = new OpenAI({
            apiKey: process.env.OPENAI_KEY,
            baseUrl: process.env.AI_URL
        })
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
                        case "!coinflip":
                        case "!coin":
                            await handleCoinflip(
                                client,
                                event.channel,
                                threadTs
                            );
                            break;
                        case "!roast":
                            await handleAiGame(
                                "roast",
                                args,
                                client,
                                event.channel,
                                threadTs
                            );
                            break;
                        case "!compliment":
                            await handleAiGame(
                                "compliment",
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
            ...notice("info", ":8ball:  Ask me an actual question, vro", {
                hint: "Try `!8ball will it ship today?`",
                ephemeral: false
            })
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
        ...card({
            text: `:8ball: The 8-ball says: ${answer}`,
            color: COLORS.brand,
            blocks: [
                context(`:speech_balloon:  _${esc(question.slice(0, 200))}_`),
                section(`:8ball:  *${esc(answer)}*`),
                footer("Games", "!8ball")
            ]
        })
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

async function handleCoinflip(
    client,
    channel,
    threadTs
) {
    const result = Math.random() <0.5
                    ? "Heads"
                    : "Tails";
    await client.chat.postMessage({
        channel,
        thread_ts: threadTs,
        ...card({
            text: `:coin-mario: ${result}!`,
            color: result === "Heads" ? COLORS.warning : COLORS.neutral,
            blocks: [
                section(`:coin-mario:  *${result}!*`),
                footer("Games", "!coinflip")
            ]
        })
    });
}

async function handleAiGame(
    type,
    input,
    client,
    channel,
    threadTs
) {
    if (!input) {
        await client.chat.postMessage({
            channel,
            thread_ts: threadTs,
            ...notice(
                "info",
                type === "roast"
                    ? ":fireball:  Give me something to roast!"
                    : ":sparkling-blahaj-heart:  Give me something to compliment",
                { hint: `Try \`!${type} <something>\``, ephemeral: false }
            )
        });
        return;
    }
    const prompt = type === "roast" ? `
    Roast the following thing/person in a funny Slack friendly way

    Traget: ${input}

    Rules:
    1. Kepp it playful, not genuinely hateful.
    2. No slurs
    3. No threats
    4. Keep it under 2 sentences
    5. Be creative`
    : `
    Give a funny but genuine compliment about the following.

    Target: ${input}

    Rules:
    1. Keep it Slack friendly
    2. Keep it under 2 sentences.
    3. Dont be overly cheesy.
    4. Be specific to the target when possible.
    `;

    const response = await openai.response.create({
        model: process.env.AI_MODEL,
        instructions: "You are Pulse, A slack bot",
        input: prompt
    });

    const answer = response.output_text?.trim();

    if (!answer) {
        throw new Error("AI returned an empty response");
    }

    await client.chat.postMessage({
        channel,
        thread_ts: threadTs,
        ...card({
            text: type === "roast"
                ? `:fireball: ${answer}`
                : `:sparkling-blahaj-heart: ${answer}`,
            color: type === "roast" ? COLORS.danger : COLORS.success,
            blocks: [
                section(
                    type === "roast"
                        ? `:fireball:  ${esc(answer)}`
                        : `:sparkling-blahaj-heart:  ${esc(answer)}`
                ),
                context(`_${type === "roast" ? "Roasting" : "Complimenting"}: ${esc(input.slice(0, 100))}_`),
                footer("Games", `!${type}`)
            ]
        })
    });
}
