import {
    COLORS,
    card,
    dots,
    fields,
    footer,
    header,
    notice,
    section
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
                    await respond(stripe(notice(
                        "error",
                        ":loll: No vro",
                        { hint: "`/p-purge` is owner-only." }
                    )));
                    return;
                }
                const args = command.text?.trim().split(/\s+/) || [];
                const includeThreads = args.includes("--threads");
                const amountArg = args.find(arg => /^\d+$/.test(arg));
                const amount = Number(amountArg|| "10");
                if (!Number.isInteger(amount) ||
                amount < 1 ||
                amount > 100) {
                    await respond(stripe(notice(
                        "error",
                        "Give me a number between 1 and 100.",
                        { hint: "Usage: `/p-purge [number] [--threads]`" }
                    )));
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
                        await respond(stripe(notice(
                            "info",
                            "I don't have any messages to purge here!",
                            { hint: "Only Pulse's own recent messages are removed." }
                        )));

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

                    const failed = messagesToDelete.length - deleted;

                    await respond(stripe(card({
                        text: `Deleted ${deleted} Pulse message${deleted === 1 ? "" : "s"}.`,
                        color: failed ? COLORS.warning : COLORS.success,
                        response_type: "ephemeral",
                        blocks: [
                            header("Purge complete", "♻️"),
                            fields([
                                ["Deleted", `\`${deleted}\` message${deleted === 1 ? "" : "s"}`],
                                ["Channel", `<#${command.channel_id}>`],
                                ["Threads", includeThreads ? "Included" : "Skipped"],
                                ...(failed ? [["Couldn't delete", `\`${failed}\``]] : [])
                            ]),
                            ...(failed
                                ? [section(":warning:  Some messages couldn't be deleted. Check the logs for details.")]
                                : []),
                            footer("Purge", dots("only Pulse's own messages", "`/p-purge [number] [--threads]`"))
                        ]
                    })));

                    ctx.logger.info(`Purges ${deleted} from ${command.channel_id}`);
                } catch (error) {
                    ctx.logger.error({
                        error: {
                            message: error.message,
                            stack: error.stack
                        }
                    }, "Purge failed");

                    await respond(stripe(notice(
                        "error",
                        "I couldn't purge my messages.",
                        { hint: "Check Pulse's logs for details." }
                    )));
                }
            }
        });
        ctx.logger.info("Purge plugin initialized")
    }
};