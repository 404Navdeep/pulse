import {
    COLORS,
    card,
    notice,
    section,
    context,
    esc,
    when
} from "../../core/ui.js";

export default {
    id: "afk",
    name: "AFK",
    version: "0.1.0",

    async init(ctx) {
        const auth = await ctx.slack.userClient.auth.test();
        const userId = auth.user_id;

        ctx.state.set("afk.userId", userId);
        ctx.state.set("afk", {
            enabled: false,
            reason: null,
            since: null,
            notifiedUsers: new Set()
        });
        ctx.commands.register({
            name: "p-afk",
            description: "Enable AFK mode",
            ownerOnly: true,

            async execute({ command, ack, respond, ctx }) {
                await ack();

                const reason =
                    command.text?.trim() || "AFK";
                const state = {
                    enabled: true,
                    reason,
                    since: Date.now(),
                    notifiedUsers: new Set()
                };
                ctx.state.set("afk", state);

                await respond(
                    notice(
                        "success",
                        "You're now *AFK*",
                        {
                            hint: `Reason: ${esc(reason)}  ·  \`/p-awake\` when you're back`
                        }
                    )
                );

                ctx.events.emitEvent(
                    "afk.enabled",
                    state
                );
            }
        });


        ctx.commands.register({
            name: "p-awake",
            description: "Disable AFK mode",
            ownerOnly: true,

            async execute({ ack, respond, ctx }) {
                await ack();
                const current =
                    ctx.state.get("afk");
                if (!current?.enabled) {
                    await respond(
                        notice(
                            "info",
                            "You're not AFK right now.",
                            { hint: "Use `/p-afk <reason>` to go AFK." }
                        )
                    );
                    return;
                }

                ctx.state.set("afk", {
                    enabled: false,
                    reason: null,
                    since: null,
                    notifiedUsers: new Set()
                });
                await respond(
                    notice(
                        "success",
                        "Welcome back, you're no longer *AFK*."
                    )
                );
                
                ctx.events.emitEvent(
                    "afk.disabled"
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
                        "AFK message handler failed"
                    );
                }
            }
        );

        ctx.logger.info(
            `AFK plugin initialized for ${userId}`
        );
    }
};

async function handleMessage(event, ctx) {
    const afk = ctx.state.get("afk");
    
    if (!afk?.enabled) {
        return;
    }
    const myUserId = 
        ctx.state.get("afk.userId");

    if (!event.user) {
        return;
    }

    if (event.user === myUserId) {
        return;
    }

    if (event.subtype) {
        return;
    }

    if (afk.notifiedUsers.has(event.user)) {
        return;
    }

    if (event.channel_type === "im") {
        await notifyUser({
            event,
            ctx
        });
        return;
    }

    if (event.channel_type === "mpim") {
        await notifyUser({
            event,
            ctx
        });
        return;
    }

    if (event.thread_ts) {
        const parent =
            await getThreadParent(
                event,
                ctx
            );
        if (!parent) {
            return;
        }

        if (parent.user !== myUserId) {
            return
        }

        await notifyUser({
            event,
            ctx
        });
    }
}

async function getThreadParent(event, ctx) {
    try {
        const result = 
            await ctx.slack.userClient.conversations.replies({
                channel: event.channel,
                ts: event.thread_ts,
                limit: 1
            });
            return result.messages?.[0] ?? null;
    } catch (error) {
        ctx.logger.error(
            {
                channel: event.channel,
                thread: event.thread_ts,
                error: {
                    message: error.message,
                    stack: error.stack
                }
            },
            "Failed to fetch thread parent"
        );
        return null;
    }
}

async function notifyUser({ event, ctx}) {
    const afk =
        ctx.state.get("afk");

        if(!afk?.enabled) {
            return;
        }

        afk.notifiedUsers.add(event.user)

        const text =
                `:afk: I am currently AFK | Reason: ${afk.reason}\n I'll respond to your message when I am back.`

        // Compact auto-reply card; `text` stays as the notification fallback.
        const reply = card({
            text,
            color: COLORS.warning,
            blocks: [
                section(
                    `:afk: *I'm AFK right now*\n> ${esc(afk.reason).replace(/\n/g, "\n> ")}`
                ),
                context(
                    afk.since ? `Away since ${when(afk.since, "{time}")}  ·  ` : "",
                    "I'll reply when I'm back"
                )
            ]
        });

        try {
            await ctx.slack.userClient.chat.postEphemeral({
                channel: event.channel,
                user: event.user,
                ...reply
            });

            ctx.logger.info(
                `AFK ephemeral notification sent to ${event.user}`
            );

            return;
        } catch (error) {
            ctx.logger.warn({
                user: event.user,
                channel: event.channel,
                error: {
                    message: error.message
                }
            },
        "Ephemeral notif. failed!");
    }

    try {
        const dm = await ctx.slack.userClient.conversations.open({
            users: event.user
        });
    const channelId =
        dm.channel?.id;
    if (!channelId) {
        throw new Error(
            "Slack did not return a DM channel"
        );
    }
    await ctx.slack.userClient.chat.postMessage({
        channel: channelId,
        ...reply
    });
    ctx.logger.info(`AFK dm fallback sent to ${event.user}`);
    } catch (error) {
        afk.notifiedUsers.delete(
            event.user
        );

        ctx.logger.error(
            {
                user: event.user,
                error: {
                    message: error.message,
                    stack: error.stack
                }
            },
            "AFK notification completely failed"
        );
    }
}