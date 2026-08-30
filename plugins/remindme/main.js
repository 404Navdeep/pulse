export default {
    id: "readme",
    name: "Remind Me",
    version: "0.1.0",

    async init(ctx) {
        const auth = await ctx.slack.botClient.auth.test();
        const ownerUserId = process.env.OWNER_ID;

        ctx.state.set(
            "remindme.ownerUserId",
            ownerUserId
        );

        ctx.state.set(
            "remindme.reminders",
            new Map()
        );

        ctx.commands.register({
            name: "p-remindme",
            description: "Set a reminder",
            ownerOnly: true,

            async execute({
                command,
                ack,
                respond,
                ctx
            }) {
                await ack();
                const input = command.text?.trim();

                if (!input) {
                    await respond({
                        response_type: "ephemeral",
                        text: ":alarm_clock: Usage: `/remindme 30m Do Something`"
                    });
                    return;
                }

                const parsed = parseReminder(input);
                if (!parsed) {
                    await respond({
                        response_type: "ephemeral",
                        text: ":x: I couldn't understand that time.\n\n" +
                            "Try: \n" +
                            "`/remindme 30m Submit project`\n" +
                            "`/remindme 1h Get the submission`\n"
                    });
                    return;
                }
                const {
                    delay,
                    text
                } = parsed;

                if (delay <=0) {
                    await respond({
                        response_type: "ephemeral",
                        text: ":x: The reminder time must be in the future."
                    });
                }

                const reminderId = crypto.randomUUID();
                const reminders = ctx.state.get("remindme.reminders");

                const reminder = {
                    id: reminderId,
                    userId: command.user_id,
                    text,
                    remindAt: Date.now() + delay,
                    timeout: null
                };

                reminder.timeout = setTimeout(
                    () => {
                        fireReminder(
                            reminder,
                            ctx
                        );
                    },
                    delay
                );

                reminders.set(
                    reminderId,
                    reminder1
                );

                ctx.state.set("remindme.reminders",
                    reminders
                );

                await respond({
                    response_type: "Ephemeral",
                    text: `:alarm_clock: Reminder set for ${formatDelay(delay)}. \n` +
                        `I'll DM you when it's time`
                });
                ctx.logger.info(
                    {
                        reminderId,
                        userId: command.user_id,
                        remindAt: reminder.remindAt
                    },
                    "Reminder created"
                );
            }
        });

        ctx.logger.info(`Remind Me plugin initialized for ${ownerUserId}`);
    }
};

async function fireReminder(
    reminder,
    ctx
) {
    const reminders = ctx.state.get("remindme.reminders");

    if (!reminders?.has(reminder.id)) {
        return;
    }

    reminders.delete(reminder.id);
    ctx.state.set("remindme.reminders",
        reminders
    );

    try {
        const dm =
            await ctx.slack.botClient.conversations.open({
                users: reminder.userId
            });
        const channelId = dm.channel?.id;
        if (!channelId) {
            throw new Error("Slack did not return a DM channel");
        }
        await ctx.slack.botClient.chat.postMessage({
            channel: channelId,
            text: `:alarm_clock: Reminder\n\n${reminder.text}`,
            blocks: [
                {
                    type: "header",
                    text: {
                        type: "plain_text",
                        text: "Reminder"
                    }
                },
                {
                    type: "section",
                    text: {
                        type: "mrkdwn",
                        text: reminder.text
                    }
                }
            ]
        });

        ctx.logger.info({
            reminderId: reminder.id,
            userId: reminder.userId
        }, "Reminder failed"); 
    } catch (error) {
        ctx.logger.error({
            reminderId: reminder.id,
            userId: reminder.userId,
            error: {
                message: error.message,
                stack: error.stack
            }
        }, "Failed to send reminder");
    }
}

function parseReminder(input) {
    const match = input.match(/^(\d+(?:\.\d+)?)(s|m|h|d)\s+(.+)$/);
    if (!match) {
        return null;
    }

    const amount = Number(match[1]);
    const unit = match[2];
    const text = match[3].trim();
    if (!Number.isFinite(amount) || !text) {
        return null;
    }
    const multipliers = {
        s: 1000,
        m: 60 * 1000,
        h: 60 * 60 * 1000,
        d: 24 * 60 * 60 *100
    };
    return {
        delay: amount * multipliers[unit],
        text
    };
}

function formatDelay(ms) {
    const seconds = Math.round(ms / 1000);

    if (seconds < 60) {return `${seconds} second${seconds === 1 ? "" : "s"}`};
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) {return `${minutes} minutes${minutes === 1 ? "" : "m"}`};
    const hours = Math.round(minutes / 60);
    if (hours < 24) {return `${hours} hour${hours === 1 ? "" : "h"}`};
    const days = Math.round(hours / 24);
    return `${days} day${day === 1 ? "" : "d"}`;
}