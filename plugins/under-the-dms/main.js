export default {
    id: "under-the-dms",
    name: "Under the DMs",
    version: "0.1.0",

    async init(ctx) {
        const auth =
            await ctx.slack.userClient.auth.test();
        const userId = auth.user_id;

        ctx.state.set(
            "underTheDMs.userId",
            userId
        );

        ctx.state.set(
            "underTheDMs",
            {
                enabled:false,
                notifiedUsers: new Set()
            }
        );

        ctx.commands.register({
            name: "underthedms",
            description: "Toggle Under the DMs",
            ownerOnly: true,

            async execute({ ack, respond, ctx }) {
                await ack();

                const current =
                    ctx.state.get("underTheDMs");
                const enabled =
                    !current?.enabled;
                
                ctx.state.set(
                    "underTheDMs",
                    {
                        enabled,
                        notifiedUsers:
                            new Set()
                    }
                );

                await respond({
                    response_type: "ephemeral",
                    text: enabled
                        ? ":mailbox_with_mail: Under the DMs tragedy is now ON"
                        : ":mailbox_with_not_mail: Under the DMs in now OFF"
                });

                ctx.events.emitEvent(
                    enabled
                        ? "underTheDMs.enabled"
                        : "underTheDMs.disabled"
                );
            }
        });

        ctx.slack.app.event(
            "message",
            async ({ event }) => {
                try {
                    await handleMessage(
                        event,
                        ctx
                    );
                } catch (error) {
                    ctx.logger.error(
                        {
                            error: {
                                message: error.message,
                                stack: error.stack
                            }
                        },
                        "Under the DMs handler failed"
                    );
                }
            }
        );

        ctx.logger.info(`Under the DMs plugininitialized for ${userId}`);
    }
};

async function handleMessage(event, ctx) {
    const state =
        ctx.state.get("underTheDMs");
    
    if (!state?.enabled) {
        return;
    }

    const myUserId =
        ctx.state.get("underTheDMs.userId");
    
    if (event.channel_type !== "im") {
        return;
    }
    if (!event.user) {
        return;
    }
    if (event.user === myUserId) {
        return;
    }
    if (event.subtype) {
        return;
    }

    if (
        state.notifiedUsers.has(
            event.user
        )
    ) {
        return;
    }

    await notifyUser({
        event,
        ctx
    });
}

async function notifyUser({ event, ctx }) {
    const state =
        ctx.state.get("underTheDMs");

    if (!state?.enabled) {
        return;
    }

    state.notifiedUsers.add(
        event.user
    );

    const text = `I am currently flooded with dms\n\n` +
                `I'll get back to you when I can.`
    
    try {
        await ctx.slack.userClient.chat.postEphemeral({
            channel: event.channel,
            user: event.user,
            text
        });

        ctx.logger.info(`Under the DMs ephemeral sent to ${event.user}`);
    
        return;
    } catch (error) {
        ctx.logger.warn(
            {
                user: event.user,
                channel: event.channel,
                error: {
                    message: error.message
                }
            },
            "Under the DMs ephemeral failed; using DM fallback"
        );
    }

    try {
        const dm =
            await ctx.slack.userClient.conversations.open({
                users: event.user
            });
        
        const channelId =
            dm.channel?.id;
        
        if (!channelId) {
            throw new Error("Slack did not return a DM channel")
        };

        await ctx.slack.userClient.chat.postMessage({
            channel: channelId,
            text
        });

        ctx.logger.info(`Under the DMs fallback has been triggered by ${event.user}`);
    } catch (error) {
        state.notifiedUsers.delete(
            event.user
        );

        ctx.logger.error({
            user: event.user,
            error: {
                message: error.message,
                stack: error.stack
            }
        }, "Under the DMs notif son of a failure");
    }
}