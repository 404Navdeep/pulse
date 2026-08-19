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
                            text: "Submit"
                        },

                        close: {
                            type: "plain_text",
                            text: "Cancel"
                        },

                        blocks: [
                            {
                                type: "input",
                                block_id: "reason_block",

                                label: {
                                    type: "plain_text",
                                    text: "Why"
                                },

                                element: {
                                    type: "plain_text_input",
                                    action_id: "reason",
                                    multiline: true,

                                    placeholder: {
                                        type: "plain_text",
                                        text: "Why do you want to join?"
                                    }
                                }
                            }
                        ]
                    }
                });

                await respond({
                    response_type: "ephemeral",
                    text: "Join request sent!"
                });
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
            {
                type: "header",

                text: {
                    type: "plain_text",
                    text: "New 404PC Join Request"
                }
            },

            {
                type: "section",

                fields: [
                    {
                        type: "mrkdwn",
                        text:
                            `*User:*\n<@${requesterId}>`
                    },

                    {
                        type: "mrkdwn",
                        text:
                            `*Destination:*\n<#${channelId}>`
                    }
                ]
            },

            {
                type: "section",

                text: {
                    type: "mrkdwn",
                    text:
                        `*Why:*\n${reason}`
                }
            },

            {
                type: "actions",

                elements: [
                    {
                        type: "button",

                        text: {
                            type: "plain_text",
                            text: "Approve"
                        },

                        style: "primary",

                        action_id:
                            "join404pc_approve",

                        value:
                            JSON.stringify({
                                requesterId
                            })
                    },

                    {
                        type: "button",

                        text: {
                            type: "plain_text",
                            text: "Deny"
                        },

                        style: "danger",

                        action_id:
                            "join404pc_deny",

                        value:
                            JSON.stringify({
                                requesterId
                            })
                    }
                ]
            }
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

                text:
                    "Better luck next time. Your 404PC join request was denied."
            });
        }

        await ctx.slack.botClient.chat.update({
            channel: body.channel.id,
            ts: body.message.ts,

            text:
                `404PC request denied for <@${requesterId}>.`,

            blocks: [
                {
                    type: "section",

                    text: {
                        type: "mrkdwn",

                        text:
                            `:x: <@${requesterId}>'s 404PC request was denied.`
                    }
                }
            ]
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
            {
                type: "section",

                text: {
                    type: "mrkdwn",

                    text:
                        `:tada: Welcome <@${requesterId}>!\n\n` +
                        `This is 404PC — my personal community/place.`
                }
            },

            {
                type: "section",

                text: {
                    type: "mrkdwn",

                    text:
                        `If you want notifications for 404PC pings, you can join the ping group below.`
                }
            },

            {
                type: "actions",

                elements: [
                    {
                        type: "button",

                        text: {
                            type: "plain_text",

                            text:
                                "Join 404ers ping group"
                        },

                        style: "primary",

                        action_id:
                            "join404pc_ping",

                        value:
                            requesterId
                    }
                ]
            }
        ]
    });

    await ctx.slack.botClient.chat.update({
        channel: body.channel.id,
        ts: body.message.ts,

        text:
            `404PC request approved for <@${requesterId}>.`,

        blocks: [
            {
                type: "section",

                text: {
                    type: "mrkdwn",

                    text:
                        `:white_check_mark: <@${requesterId}>'s 404PC request was approved!`
                }
            }
        ]
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

            text:
                "Your 404PC request was approved. Welcome!"
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
            text:
                "This button ain't for you, mate."
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
            text:
                "The ping group is not configured yet."
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
        text:
            ":white_check_mark: Added you to the 404ers ping group!"
    });

    ctx.logger.info(
        `${requesterId} joined the 404ers ping group`
    );
}