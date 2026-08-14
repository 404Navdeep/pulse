export default {
    id: "afk",
    name: "AFK",
    version: "1.0.0",

    async init(ctx) {

        const auth = await ctx.slack.userClient.auth.test();
        
        ctx.state.set("afk.userId", auth.user_id);

        ctx.state.set("afk", {
            enabled: false,
            reason: null,
            since: null
        });

        ctx.commands.register({
            name: "afk",
            description: "Set yourself as AFK",

            async execute({ command, ack, respond, ctx }) {
                await ack();

                const reason =
                    command.text?.trim() || "AFK"
                
                const state = {
                    enabled: true,
                    reason,
                    since: Date.now(),
                    notifiedUsers: new Set()
                };

                ctx.state.set("afk",state);

                await respond({
                    response_type: "ephemeral",
                    text:
                        `:afk: You are now AFK. \n` +
                        `Reason ${reason}`
                });

                ctx.events.emitEvent("afk.enabled", state);
            }
        });

        ctx.commands.register({
            name: "awake",
            description: "Disable AFK mode",

            async execute({ ack, respond, ctx }) {
                await ack();

                const current = ctx.state.get("afk");

                if (!current?.enabled) {
                    await respond({
                        response_type: "ephemeral",
                        text: "You are not currently :afk:"
                    });
                    return;
                }

                ctx.state.set("afk", {
                    enabled: false,
                    reason: null,
                    since: null
                });

                await respond({
                    response_type: "ephemeral",
                    text: "You are no longer AFK"
                });

                ctx.events.emitEvent("afk.disabled");
            }
        });

        ctx.slack.app.event(
            "message",
            async ({ event }) => {
                await handleMessage(event, ctx);
            }
        );

        ctx.logger.info(`AFK plugin initialized for ${auth.user_id}`);
    }
};

async function handleMessage(event, ctx) {
    const afk = ctx.state.get("afk");
    const myUserId = ctx.state.get("afk.userId");

    if (!afk?.enabled) {
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

    const isDM =
        event.channel_type === "im";
    
    const isThread = 
        Boolean(event.thread_ts);
    if (!isDM && !isThread) {
        return;
    }
    if (afk.notifiedUsers.has(event.user)) {
        return;
    }

    afk.notifiedUsers.add(event.user)

    const message = 
        `Navdeep is currently AFK.\n`+
        `Reason: ${afk.reason}\n\n`+
        `They'll see your message when they're back.`;
    
    try {
        await ctx.slack.userClient.chat.postEphemeral({
            channel: event.channel,
            user: event.user,
            text: message
        });

        ctx.logger.info(
            `AFK notification sent to ${event.user}`
        );
    } catch (error) {
        ctx.logger.error(
            {
                user: event.user,
                channel: event.channel,
                error
            },
            "Failed to send AFK notification"
        );
    }
}