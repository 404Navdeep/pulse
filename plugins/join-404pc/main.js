export default {
    id: "join-404pc",
    name: "Join 404-PC",
    version: "0.1.0",

    async init(ctx) {
        const auth =
            await ctx.slack.userClient.auth.test();
        
        const ownerUserId =
            process.env.OWNER_ID || auth.user_id;
        
        ctx.state.set(
            "join404pc.ownerUserId",
            ownerUserId
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

                const channelId =
                    command.channel_id;
                
                const userId =
                    command.user_id;

                await ctx.slack.userClient.views.open({
                    trigger_id: command.trigger_id,
                    view: {
                        type: "modal",
                        callback_id: "join404pc_request",
                        private_metadata: 
                            JSON.stringify({
                                userId,
                                channelId
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
                                        text: "why?"
                                    }
                                }
                            }
                        ]
                    }
                });

                await respond({
                    response_type: "ephemeral",
                    text: "join request sent! :yay:"
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
                        "Join request failed"
                    );
                }
            }
        );

        ctx.slack.app.action(
            "join404pc_approve",
            async ({ ack, body }) => {
                await ack();

                await handleDecision(
                    body,
                    true,
                    ctx
                );
            }
        );

        ctx.slack.app.action(
            "join404pc_deny",
            async ({ ack, body }) => {
                await ack();

                await handleDecision(
                    body,
                    false,
                    ctx
                );
            }
        );

        ctx.slack.app.action(
            "join400ers_ping",
            async ({ ack, body, respond }) => {
                await ack();
                await handlePingOptIn(
                    body,
                    respond,
                    ctx
                );
            }
        );

        ctx.logger.info(`Join plugin initialized for ${ownerUserId}`);
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
    const channelId =
        metadata.channelId;
    
    const reason =
        view.state.values
            ?.reason_block
            ?.reason
            ?.value
            ?.trim();
    if (!reason) {
        ctx.logger.warn(`Join request from ${requesterId} had no reason`);

        return;
    }

    const ownerUserId =
        ctx.state.get("join404pc.ownerUserId");
    
    const userInfo =
        await ctx.slack.userClient.users.info({
            user: requesterId
        });
    const user =
        userInfo.user;
    const displayName =
        user?.profile?.display_name ||
        user?.real_name ||
        user?.name ||
        requesterId;

    await ctx.slack.userClient.chat.postMessage({
        channel: ownerUserId,

        text: `New join request from ${displayName}` +
            `Reason: ${reason}`,
        
        blocks: [
            {
                type: "header",
                text: {
                    type: "plain_text",
                    text: "New join request"
                }
            },
            {
                type: "section",
                fields: [
                    {
                        type: "mrkdwn",
                        text: `*User:*\n<@${requesterId}>`
                    },
                    {
                        type: "mrkdwn",
                        text: `*Channel:*\n<#${channelId}>`
                    }
                ]
            },
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `*Why:*\n${reason}`
                }
            },
            {
                type: "actions",
                elements : [
                    {
                        type: "button",
                        text: {
                            type: "plain_text",
                            text: "Approve"
                        },
                        style: "primary",
                        action_id: "join404pc_approve",

                        value: JSON.stringify({
                            requesterId,
                            channelId
                        })
                    },
                    {
                        type: "button",
                        text: {
                            type: "plain_text",
                            text: "Deny"
                        },
                        style: "danger",
                        action_id: "join404pc_deny",
                        value: JSON.stringify({
                            requesterId,
                            channelId
                        })
                    }
                ]
            }
        ]
    });
    ctx.logger.info (`Join request submitted by ${requesterId}`);
}

async function handleDecision(
    body,
    appproved,
    ctx
) {
    const ownerUserId =
        ctx.state.get("join404pc.ownerUserId");
    if (body.user?.id !== ownerUserId) {
        ctx.logger.warn(
        {
            user: body.user?.id
        },
    "Unauthorized join decision attempt"
        );
        return;
    }

    const data = JSON.parse(
        body.actions[0].value
    );
    const requesterId =
        data.requesterId;
    const channelId = 
        data.channelId;
    
    if (!appproved) {
        await ctx.slack.userClient.chat.postMessage({
            channel: requesterId,
            text: "Better luck next time. Your 404-p.c. join request was denied."
        });

        await ctx.slack.userClient.chat.update({
            channel: body.channel.id,
            ts: body.message.ts,

            text: "404PC request denied",
            blocks: [
                {
                    type: "section",
                    text: {
                        type: "mrkdwn",
                        text: `:cross-red: <@${requesterId}>'s request to join denied.`
                    }
                }
            ]
        });
        return;
    }

await ctx.slack.userClient.conversations.invite({
    channel: channelId,
    users: requesterId
});

await ctx.slack.userClient.chat.postMessage({
    channel: channelId,
    text: `Welcome <@${requesterId}>. This is 404place <@U083T3ZP6AV>'s personal channel/place!`,
    blocks: [
        {
            type: "section",
            text: {
                type: "mrkdwn",
                text: `Welcome <@${requesterId}>. This is 404place <@U083T3ZP6AV>'s personal channel/place!`
            }
        },
        {
            type: "section",
            text: {
                type: "mrkdwn",
                text: `If you want notifications for 404ers pings, you can join the ping below!`
            }
        },
        {
            type: "actions",
            text: {
                type: "plain_text",
                text: "Join 404ers ping group"
            },
            style: "primary",
            action_id: "join4040ers_ping",
            value : requesterId
        }
    ]
});

await ctx.slack.userClient.chat.update({
    channel: body.channel.id,
    ts: body.message.ts,
    text: `404-P.C. request approved for <@${requesterId}>`,
    blocks: [
        {
            type: "section",
            text: {
                type: "mrkdwn",
                text: `:tick: <@${requesterId} 404-P.C. request was approved!`
            }
        }
    ]
});

await ctx.slack.userClient.chat.postMessage({
    channel: requesterId,
    text: "Your 404PC request was approved. Welcome!"
});

ctx.logger.info(`404-P.C. request approved for <@${requesterId}>`);
}
async function handlePingOptIn(
    body,
    respond,
    ctx
) {
    const requesterId =
        body.actions[0].value;
    
    const clickingUserId =
        body.user?.id;
    
    if ( clickingUserId !== requesterId) {
        await respond({
            response_type: "ephemeral",
            text: `This button aint for u mate :loll:`
        });
        return;
    }
    
    const userGroupId =
        process.env.S404ERS_GID;

    if (!userGroupId) {
        ctx.logger.error(`The env variable is missing`);
        await respond({
            response_type: "ephemeral",
            text: "The ping group is not configured yet."
        });
        return;
    }

    await ctx.slack.userClient.usergroups.users.update({
        usergroup: userGroupId,
        users: requesterId
    });

    await respond({
        response_type: "ephemeral",
        text: ":loll: Added u now get pinged!"
    });
    ctx.logger.info(`${requesterId} joined the 404ers ping group`);
    
}