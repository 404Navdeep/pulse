import {
    COLORS,
    actions,
    button,
    card,
    clamp,
    context,
    divider,
    esc,
    fields,
    footer,
    header,
    notice,
    section,
    when
} from "../../core/ui.js";

const PLUGIN = "Join 404PC";

// `card` puts its text above the coloured stripe; here the text should only be
// the notification fallback, so move it onto the attachment.
function stripe(message, { ephemeral = true } = {}) {
    const { text, attachments, response_type, ...rest } = message;
    return {
        ...rest,
        ...(ephemeral && response_type ? { response_type } : {}),
        attachments: attachments.map(a => ({ ...a, fallback: text ?? a.fallback }))
    };
}

// Quote a block of user text so it reads as "their words".
const quote = text =>
    esc(text).split("\n").map(line => `> ${line}`).join("\n");

export default {
    id: "join-404pc",
    name: "Join 404-PC",
    version: "0.2.0",

    async init(ctx) {
        const auth = await ctx.slack.botClient.auth.test();

        const ownerUserId =
            process.env.OWNER_ID;

        const channelId =
            process.env.S404PC_CID;

        if (!ownerUserId) {
            throw new Error("OWNER_ID is not configured");
        }

        if (!channelId) {
            throw new Error("S404PC_CID is not configured");
        }

        ctx.state.set(
            "join404pc.ownerUserId",
            ownerUserId
        );

        ctx.state.set(
            "join404pc.channelId",
            channelId
        );

        ctx.commands.register({
            name: "join-404pc",
            description: "Request to join 404PC",

            async execute({
                command,
                ack,
                respond,
                ctx
            }) {
                await ack();

                await ctx.slack.botClient.views.open({
                    trigger_id: command.trigger_id,

                    view: {
                        type: "modal",
                        callback_id: "join404pc_request",

                        private_metadata:
                            JSON.stringify({
                                userId: command.user_id
                            }),

                        title: {
                            type: "plain_text",
                            text: "Join 404PC"
                        },

                        submit: {
                            type: "plain_text",
                            text: "Send request"
                        },

                        close: {
                            type: "plain_text",
                            text: "Cancel"
                        },

                        blocks: [
                            section(
                                ":wave:  *Want in?*\n" +
                                "404PC is my personal corner of Slack. " +
                                "Tell me a bit about yourself and I'll take a look."
                            ),
                            {
                                type: "input",
                                block_id: "reason_block",

                                label: {
                                    type: "plain_text",
                                    text: "Why do you want to join?"
                                },

                                element: {
                                    type: "plain_text_input",
                                    action_id: "reason",
                                    multiline: true,

                                    placeholder: {
                                        type: "plain_text",
                                        text: "Who are you and what brings you to 404PC?"
                                    }
                                }
                            },
                            context("Your request goes straight to my DMs. You'll hear back from me here.")
                        ]
                    }
                });

                await respond(stripe(notice(
                    "info",
                    "Fill in the form to send your join request.",
                    { hint: "Nothing is sent until you press *Send request*." }
                )));
            }
        });

        ctx.slack.app.view(
            "join404pc_request",
            async ({ ack, body, view }) => {
                try {
                    await ack();

                    await handleSubmission(
                        body,
                        view,
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
                        "Join request submission failed"
                    );
                }
            }
        );

        ctx.slack.app.action(
            "join404pc_approve",
            async ({ ack, body }) => {
                await ack();

                try {
                    await handleDecision(
                        body,
                        true,
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
                        "404PC approval failed"
                    );
                }
            }
        );

        ctx.slack.app.action(
            "join404pc_deny",
            async ({ ack, body }) => {
                await ack();

                try {
                    await handleDecision(
                        body,
                        false,
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
                        "404PC denial failed"
                    );
                }
            }
        );

        ctx.slack.app.action(
            "join404pc_ping",
            async ({ ack, body }) => {
                await ack();

                try {
                    await handlePingOptIn(
                        body,
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
                        "404PC ping opt-in failed"
                    );
                }
            }
        );

        ctx.logger.info(
            `Join 404PC plugin initialized as ${auth.user_id}`
        );
    }
};

// Rebuilds the owner's request message after a decision: keeps the request
// details, drops the buttons, and adds who decided and when.
function decidedBlocks(body, { emoji, verdict, ownerId }) {
    const original = (body.message?.blocks ?? []).filter(
        block => block.type !== "actions" && block.type !== "context"
    );

    return [
        ...original,
        divider(),
        section(`${emoji}  ${verdict}`),
        footer(PLUGIN, `decided by <@${ownerId}>  ·  ${when(Date.now())}`)
    ].slice(0, 50);
}

async function handleSubmission(
    body,
    view,
    ctx
) {
    const metadata =
        JSON.parse(
            view.private_metadata
        );

    const requesterId =
        metadata.userId;

    const reason =
        view.state.values
            ?.reason_block
            ?.reason
            ?.value
            ?.trim();

    if (!reason) {
        ctx.logger.warn(
            `Join request from ${requesterId} had no reason`
        );

        return;
    }

    const ownerUserId =
        ctx.state.get(
            "join404pc.ownerUserId"
        );

    const channelId =
        ctx.state.get(
            "join404pc.channelId"
        );

    const userInfo =
        await ctx.slack.botClient.users.info({
            user: requesterId
        });

    const user =
        userInfo.user;

    const displayName =
        user?.profile?.display_name ||
        user?.real_name ||
        user?.name ||
        requesterId;

    const ownerDM =
        await ctx.slack.botClient.conversations.open({
            users: ownerUserId
        });

    const ownerChannelId =
        ownerDM.channel?.id;

    if (!ownerChannelId) {
        throw new Error(
            "Could not open DM with owner"
        );
    }

    await ctx.slack.botClient.chat.postMessage({
        channel: ownerChannelId,

        text:
            `New 404PC join request from ${displayName}.\n` +
            `Reason: ${reason}`,

        blocks: [
            header("New join request", "📬"),

            fields([
                ["Requester", `<@${requesterId}>`],
                ["Destination", `<#${channelId}>`],
                ["Sent", when(Date.now())]
            ]),

            section(`*Why they want in*\n${quote(clamp(reason, 2800))}`),

            actions(
                button("Approve", "join404pc_approve", {
                    style: "primary",
                    value: JSON.stringify({ requesterId })
                }),
                button("Deny", "join404pc_deny", {
                    style: "danger",
                    value: JSON.stringify({ requesterId })
                })
            ),

            footer(PLUGIN, "Approving invites them to the channel")
        ]
    });

    ctx.logger.info(
        `Join request submitted by ${requesterId}`
    );
}

async function handleDecision(
    body,
    approved,
    ctx
) {
    const ownerUserId =
        ctx.state.get(
            "join404pc.ownerUserId"
        );

    if (body.user?.id !== ownerUserId) {
        ctx.logger.warn(
            {
                user: body.user?.id
            },
            "Unauthorized join decision attempt"
        );

        return;
    }

    const data =
        JSON.parse(
            body.actions[0].value
        );

    const requesterId =
        data.requesterId;

    const channelId =
        ctx.state.get(
            "join404pc.channelId"
        );

    if (!approved) {
        const requesterDM =
            await ctx.slack.botClient.conversations.open({
                users: requesterId
            });

        const requesterChannelId =
            requesterDM.channel?.id;

        if (requesterChannelId) {
            await ctx.slack.botClient.chat.postMessage({
                channel: requesterChannelId,

                ...stripe(card({
                    text: "Better luck next time. Your 404PC join request was denied.",
                    color: COLORS.neutral,
                    blocks: [
                        section(
                            ":lock:  *Your 404PC request wasn't approved this time.*\n" +
                            "Better luck next time!"
                        ),
                        footer(PLUGIN, "Decision from the owner")
                    ]
                }), { ephemeral: false })
            });
        }

        await ctx.slack.botClient.chat.update({
            channel: body.channel.id,
            ts: body.message.ts,

            text:
                `404PC request denied for <@${requesterId}>.`,

            blocks: decidedBlocks(body, {
                emoji: ":x:",
                verdict: `*Denied* — <@${requesterId}> was not added to 404PC.`,
                ownerId: body.user.id
            })
        });

        ctx.logger.info(
            `404PC request denied for ${requesterId}`
        );

        return;
    }

    await ctx.slack.botClient.conversations.invite({
        channel: channelId,
        users: requesterId
    });

    await ctx.slack.botClient.chat.postMessage({
        channel: channelId,

        text:
            `Welcome <@${requesterId}> to 404PC!`,

        blocks: [
            header("Welcome to 404PC", "🎉"),

            section(
                `Hey <@${requesterId}>, glad you're here!\n` +
                "This is *404PC*, my personal community and corner of Slack."
            ),

            divider(),

            section(
                ":bell:  *Want pings?*\n" +
                "Join the ping group to get notified when something happens in 404PC."
            ),

            actions(
                button("Join 404ers ping group", "join404pc_ping", {
                    style: "primary",
                    value: requesterId
                })
            ),

            footer(PLUGIN, `only <@${requesterId}> can use the button`)
        ]
    });

    await ctx.slack.botClient.chat.update({
        channel: body.channel.id,
        ts: body.message.ts,

        text:
            `404PC request approved for <@${requesterId}>.`,

        blocks: decidedBlocks(body, {
            emoji: ":white_check_mark:",
            verdict: `*Approved* — <@${requesterId}> has been added to <#${channelId}>.`,
            ownerId: body.user.id
        })
    });

    const requesterDM =
        await ctx.slack.botClient.conversations.open({
            users: requesterId
        });

    const requesterChannelId =
        requesterDM.channel?.id;

    if (requesterChannelId) {
        await ctx.slack.botClient.chat.postMessage({
            channel: requesterChannelId,

            ...stripe(card({
                text: "Your 404PC request was approved. Welcome!",
                color: COLORS.success,
                blocks: [
                    section(
                        ":tada:  *You're in!*\n" +
                        `Your 404PC request was approved. Head over to <#${channelId}> and say hi.`
                    ),
                    footer(PLUGIN, "Decision from the owner")
                ]
            }), { ephemeral: false })
        });
    }

    ctx.logger.info(
        `404PC request approved for ${requesterId}`
    );
}

async function handlePingOptIn(
    body,
    ctx
) {
    const action =
        body.actions?.[0];

    if (!action) {
        return;
    }

    const requesterId =
        action.value;

    const clickingUserId =
        body.user?.id;

    if (!requesterId || !clickingUserId) {
        return;
    }

    if (clickingUserId !== requesterId) {
        await ctx.slack.botClient.chat.postEphemeral({
            channel: body.channel.id,
            user: clickingUserId,
            ...stripe(notice(
                "warning",
                "This button ain't for you, mate.",
                { hint: "It only works for the person who was just welcomed." }
            ), { ephemeral: false })
        });

        ctx.logger.info(
            `Unauthorized 404ers ping button attempt by ${clickingUserId}`
        );

        return;
    }

    const userGroupId =
        process.env.S404ERS_GID;

    if (!userGroupId) {
        ctx.logger.error(
            "S404ERS_GID is missing"
        );

        await ctx.slack.botClient.chat.postEphemeral({
            channel: body.channel.id,
            user: clickingUserId,
            ...stripe(notice(
                "error",
                "The ping group is not configured yet.",
                { hint: "Ask the owner to set the ping group." }
            ), { ephemeral: false })
        });

        return;
    }

    await ctx.slack.botClient.usergroups.users.update({
        usergroup: userGroupId,
        users: requesterId
    });

    await ctx.slack.botClient.chat.postEphemeral({
        channel: body.channel.id,
        user: clickingUserId,
        ...stripe(notice(
            "success",
            "Added you to the 404ers ping group!",
            { hint: "You'll now get notified on 404PC pings." }
        ), { ephemeral: false })
    });

    ctx.logger.info(
        `${requesterId} joined the 404ers ping group`
    );
}