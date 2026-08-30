export default {
    id: "purge",
    name: "Purge",
    version: "0.1.0",

    async init(ctx) {
        ctx.commands.register({
            name: "p-purge",
            description: "Dlete Pulse's recent messages",
            usage_hint: "[number]",

            async execute({
                command,
                ack,
                respond,
                ctx
            }) {
                await ack();
                const ownerID = process.env.OWNER_ID;
                if (command.user_id !== ownerID) {
                    await respond({
                        response_type: "ephemeral",
                        text: ":loll: No vro"
                    });
                    return;
                }
                const args = command.text?.trim().split(/\s+/) || [];
                const includeThreads = args.includes("--threads");
                const amountArg = args.find(arg => /^\d+$/.test(arg));
                const amount = Number(amountArg|| "10");
                if (!Number.isInteger(amount) ||
                amount < 1 ||
                amount > 100) {
                    await respond({
                        response_type: "ephemeral",
                        text: ":x: Give me a nu,ber between 1 and 100"
                    });
                    return;
                }

                try {
                    const auth = await ctx.slack.botClient.auth.test();
                    const botUserId = auth.user_id;
                    let messages = [];
                    let cursor;
                    do {
                        const response = await ctx.slack.botClient.conversations.history({
                                channel: command.channel_id,
                                limit: 100,
                                cursor
                            });

                        messages.push(...(response.messages || []));
                        cursor = response.response_metadata?.next_cursor;
                        if (messages.length >= 100 ||
                            !cursor
                        ) {
                            break;
                        }
                    } while (cursor);

                    const ownMessages = messages
                        .filter(
                            message =>
                                message.user === botUserId &&
                                message.ts
                        )
                        .slice(0, amount);

                    if (!ownMessages.length) {
                        await respond({
                            response_type: "ephemeral",
                            text: ":information_source: I dont have any messages to purge here!"
                        });

                        return;
                    }

                    let messagesToDelete = [...ownMessages];

                    if (includeThreads) {
                        for (const parent of ownMessages) {
                            try {
                                const replies = await ctx.slack.botClient.conversations.replies({
                                    channel: command.channel_id,
                                    ts: parent.ts,
                                    limit: 100
                                });

                                const ownReplies = (replies.messages || [])
                                    .filter(
                                        reply =>
                                            reply.ts !== parent.ts &&
                                            reply.user === botUserId &&
                                            reply.ts
                                    );

                                messagesToDelete.push(...ownReplies);
                            } catch (error) {
                                ctx.logger.warn(
                                    `Could not read replies for ${parent.ts}: ${error.message}`
                                );
                            }
                        }
                    }

                    let deleted = 0;

                    for (const message of messagesToDelete) {
                        try {
                            await ctx.slack.botClient.chat.delete({
                                channel: command.channel_id,
                                ts: message.ts
                            });

                            deleted++;
                        } catch (error) {
                            ctx.logger.warn(
                                `Could not delete Pulse message ${message.ts}: ${error.message}`
                            );
                        }
                    }

                    await respond({
                        response_type: "ephemeral",
                        text: `:recycle: Deleted ${deleted} Pulse messages${deleted === 1 ? "" : "s"}.`
                    });

                    ctx.logger.info(`Purges ${deleted} from ${command.channel_id}`);
                } catch (error) {
                    ctx.logger.error({
                        error: {
                            message: error.message,
                            stack: error.stack
                        }
                    }, "Purge failed");

                    await respond({
                        response_type: "ephemeral",
                        text: ":x: I couldn't purge my messages."
                    });
                }
            }
        });
        ctx.logger.info("Purge plugin initialized")
    }
};