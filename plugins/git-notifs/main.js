export default {
    id: "git-notifs",
    name: "Git Notifications",
    version: "0.2.0",

    async init(ctx) {
        const username =
            process.env.GITHUB_USERNAME || "404Navdeep";

        const channelId =
            process.env.S404PC_CID;

        if (!channelId) {
            throw new Error(
                "S404PC_CID is not configured"
            );
        }

        const stateKey =
            "githubNotifications.seen";

        if (!ctx.state.get(stateKey)) {
            ctx.state.set(
                stateKey,
                new Set()
            );
        }

        const poll = async () => {
            try {
                await checkGithubEvents(
                    username,
                    channelId,
                    stateKey,
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
                    "Github notification poll failed"
                );
            }
        };

        await poll();

        const interval = setInterval(
            poll,
            60 * 1000
        );

        ctx.state.set(
            "githubNotifications.interval",
            interval
        );

        ctx.logger.info(
            `Github notifications initialized for ${username}`
        );
    }
};

async function checkGithubEvents(
    username,
    channelId,
    stateKey,
    ctx
) {
    const response =
        await fetch(
            `https://api.github.com/users/${encodeURIComponent(username)}/events/public`,
            {
                headers: {
                    Accept:
                        "application/vnd.github+json",

                    "X-GitHub-Api-Version":
                        "2022-11-28",

                    "User-Agent":
                        "Pulse Git Notifications"
                }
            }
        );

    if (!response.ok) {
        throw new Error(
            `Github API returned ${response.status} ${response.statusText}`
        );
    }

    const events =
        await response.json();

    if (!Array.isArray(events)) {
        throw new Error(
            "Github API returned invalid data"
        );
    }

    const seen =
        ctx.state.get(stateKey) ||
        new Set();

    const newEvents = [];

    for (const event of events) {
        if (
            event.actor?.login?.toLowerCase() !==
            username.toLowerCase()
        ) {
            continue;
        }
        if (
            event.type !== "PushEvent" &&
            event.type !== "CreateEvent"
        ) {
            continue;
        }

        if (!event.id) {
            continue;
        }

        if (seen.has(event.id)) {
            continue;
        }

        newEvents.push(event);
    }

    newEvents.reverse();

    for (const event of newEvents) {
        if (event.type === "PushEvent") {
            await handlePushEvent(
                event,
                channelId,
                ctx
            );
        }

        if (event.type === "CreateEvent") {
            await handleCreateEvent(
                event,
                channelId,
                ctx
            );
        }

        seen.add(event.id);
    }

    ctx.state.set(
        stateKey,
        seen
    );
}

async function handlePushEvent(
    event,
    channelId,
    ctx
) {
    const commits =
        event.payload?.commits;

    if (!Array.isArray(commits)) {
        return;
    }

    const repo =
        event.repo?.name;

    if (!repo) {
        return;
    }

    const seen =
        ctx.state.get(
            "githubNotifications.seen"
        ) || new Set();

    for (const commit of commits) {
        if (!commit?.sha) {
            continue;
        }

        const commitKey =
            `commit:${commit.sha}`;

        if (seen.has(commitKey)) {
            continue;
        }

        const commitUrl =
            `https://github.com/${repo}/commit/${commit.sha}`;

        const text =
            `New commit <${commitUrl}|${commit.sha}> to ${repo} by 404Navdeep`;

        await ctx.slack.botClient.chat.postMessage({
            channel: channelId,
            text,
            unfurl_links: false,
            unfurl_media: false
        });

        seen.add(commitKey);

        ctx.logger.info(
            `Github commit notification sent: ${repo}@${commit.sha}`
        );
    }

    ctx.state.set(
        "githubNotifications.seen",
        seen
    );
}

async function handleCreateEvent(
    event,
    channelId,
    ctx
) {
    if (
        event.payload?.ref_type !==
        "repository"
    ) {
        return;
    }

    const repo =
        event.repo?.name;

    if (!repo) {
        return;
    }

    const repoUrl =
        `https://github.com/${repo}`;

    const text =
        `Created repository <${repoUrl}|${repo}>`;

    await ctx.slack.botClient.chat.postMessage({
        channel: channelId,
        text,
        unfurl_links: false,
        unfurl_media: false
    });

    ctx.logger.info(
        `Github repo creation notification sent: ${repo}`
    );
}