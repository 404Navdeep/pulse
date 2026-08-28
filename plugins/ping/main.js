export default {
    id: "ping",
    name: "Ping",
    version: "0.1.0",

    async init(ctx) {
        ctx.command.register({
            name: "ping",
            description: "Check Pulse's response time",

            async execute({
                command,
                ack,
                respond,
                ctx
            }) {
                const start = Date.now();
                await ack();
                const afterAck = Date.now();

                try {
                    const message =
                        await ctx.slack.botClient.chat.postMessage({
                            channel: command.channel_id,
                            text: ":ping_pong-wx: Pong!"
                        });
                    const responseTime = Date.now() - start;

                    await ctx.slack.botClient.chat.update({
                        channel: command.channel_id,
                        ts: message.ts,
                        text: `:ping_pong-wx: Pong! \`${responseTime}ms\``
                    });
                    ctx.logger.info({
                        responseTime,
                        ackTime: afterAck - start
                    },"Ping Complete")
                    } catch (error) {
                        ctx.logger.error({
                            error: {
                                message: error.message,
                                stack: error.stack
                            }
                        },"Ping failed");

                        await respond({
                            response_type: "ephemeral",
                            text: ":x: Couldnt do the pong"
                        })
                    }
                }
            });
            ctx.logger.info("Ping plugin initialized");
    }
};