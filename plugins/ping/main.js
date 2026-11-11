import {
    context,
    fields,
    footer,
    header,
    meter,
    notice,
    when
} from "../../core/ui.js";

// `card` puts its text above the coloured stripe; here the text should only be
// the notification fallback, so move it onto the attachment.
function stripe(message) {
    const { text, attachments, ...rest } = message;
    return {
        ...rest,
        attachments: attachments.map(a => ({ ...a, fallback: text ?? a.fallback }))
    };
}

// Total round-trip -> dot colour, verdict and a speed meter (0 ms full, 2 s empty).
function grade(totalTime) {
    const score = 1 - Math.min(totalTime, 2000) / 2000;
    if (totalTime < 400) return { dot: "🟢", verdict: "Snappy", score };
    if (totalTime < 1000) return { dot: "🟡", verdict: "Okay", score };
    return { dot: "🔴", verdict: "Sluggish", score };
}

export default {
    id: "ping",
    name: "Ping",
    version: "0.2.0",

    async init(ctx) {
        ctx.commands.register({
            name: "p-ping",
            description: "Check Pulse's response time",

            async execute({
                command,
                ack,
                respond,
                ctx
            }) {
                const start = performance.now();

                await ack();

                const afterAck = performance.now();

                try {
                    const slackStart = performance.now();

                    const message =
                        await ctx.slack.botClient.chat.postMessage({
                            channel: command.channel_id,
                            text: ":ping_pong-wx: Pinging…"
                        });

                    const slackTime = Math.round(
                        performance.now() - slackStart
                    );

                    const pulseTime = Math.round(
                        slackStart - afterAck
                    );

                    const totalTime = Math.round(
                        performance.now() - start
                    );

                    await ctx.slack.botClient.chat.update({
                        channel: command.channel_id,
                        ts: message.ts,

                        text:
                            `:ping_pong-wx: Pong!\n` +
                            `:fastchip_nobg: Pulse: \`${pulseTime}ms\`\n` +
                            `:slack-gold: Slack: \`${slackTime}ms\`\n` +
                            `:time-zone-fyi:  Total: \`${totalTime}ms\``,

                        blocks: [
                            header("Pong!", "🏓"),
                            fields([
                                [":fastchip_nobg: Pulse", `\`${pulseTime} ms\``],
                                [":slack-gold: Slack", `\`${slackTime} ms\``],
                                [":time-zone-fyi: Total", `\`${totalTime} ms\``]
                            ]),
                            context(
                                `${grade(totalTime).dot}  ${meter(grade(totalTime).score)}  *${grade(totalTime).verdict}*`
                            ),
                            footer("Ping", `measured ${when(Date.now(), "{time_secs}")}`)
                        ]
                    });

                    ctx.logger.info(
                        {
                            pulseTime,
                            slackTime,
                            totalTime,
                            ackTime: Math.round(
                                afterAck - start
                            )
                        },
                        "Ping Complete"
                    );
                } catch (error) {
                    ctx.logger.error(
                        {
                            error: {
                                message: error.message,
                                stack: error.stack
                            }
                        },
                        "Ping failed"
                    );

                    await respond(stripe(notice(
                        "error",
                        "Couldn't do the pong.",
                        { hint: "Check Pulse's logs for details." }
                    )));
                }
            }
        });

        ctx.logger.info(
            "Ping plugin initialized"
        );
    }
};

