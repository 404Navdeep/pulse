export default {
    id: "ping",
    name: "Ping",
    version: "0.2.0",

    async init(ctx) {
        ctx.commands.register({
            name: "ping",
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
                            text: ":ping_pong-wx: Pong!"
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
                            `:time-zone-fyi:  Total: \`${totalTime}ms\``
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

                    await respond({
                        response_type: "ephemeral",
                        text: ":x: Couldnt do the pong"
                    });
                }
            }
        });

        ctx.logger.info(
            "Ping plugin initialized"
        );
    }
};

