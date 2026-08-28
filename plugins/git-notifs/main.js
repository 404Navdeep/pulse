export default {
    id: "git-notifs",
    name: "Git Notifications",
    version: "0.3.0",

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
            "githubNotifications.seen.v3";

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

        const interval =
            setInterval(
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
                        "Pulse Git Notifications",
                    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`
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

    ctx.logger.info(
        {
            count: events.length
        },
        "Github events received"
    );

    const seen =
        ctx.state.get(stateKey) ||
        new Set();

    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);
    let firstRun = true;

    const newEvents = [];

    for (const event of events) {
        if (!event?.id) {
            continue;
        }

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

        if (seen.has(event.id)) {
            continue;
        }

        if (firstRun) {
            const eventTime =
                new Date(event.created_at).getTime();

            if (
                Number.isNaN(eventTime) ||
                eventTime < oneHourAgo
            ) {
                seen.add(event.id);
                continue;
            }
        }
        
        newEvents.push(event);
        }
    ctx.logger.info(
        {
            count: newEvents.length,
            events: newEvents.map(event => ({
                id: event.id,
                type: event.type,
                repo: event.repo?.name
            }))
        },
        "Github new notification events"
    );

    newEvents.reverse();

    for (const event of newEvents) {
        try {
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

        } catch (error) {
            ctx.logger.error(
                {
                    eventId: event.id,
                    eventType: event.type,
                    repo: event.repo?.name,
                    error: {
                        message: error.message,
                        stack: error.stack
                    }
                },
                "Failed to process Github event"
            );
        }
    }
    firstRun = false;

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
    const repo =
        event.repo?.name;

    const before =
        event.payload?.before;

    const head =
        event.payload?.head;

    if (!repo || !head) {
        ctx.logger.warn(
            {
                eventId: event.id,
                repo
            },
            "Github PushEvent missing commit information"
        );
        return;
    }

    ctx.logger.info(
        {
            eventId: event.id,
            repo,
            before,
            head
        },
        "Fetching commits for Github push"
    );

    const response =
        await fetch(
            `https://api.github.com/repos/${repo}/compare/${before}...${head}`,
            {
                headers: {
                    Accept:
                        "application/vnd.github+json",

                    "X-GitHub-Api-Version":
                        "2022-11-28",

                    "User-Agent":
                        "Pulse Git Notifications",
                    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`
                }
            }
        );

    if (!response.ok) {
        throw new Error(
            `Github compare API returned ${response.status} ${response.statusText}`
        );
    }

    const data =
        await response.json();

    const commits =
        Array.isArray(data.commits)
            ? data.commits
            : [];

    if (commits.length === 0) {
        ctx.logger.info(
            {
                eventId: event.id,
                repo
            },
            "Github push contained no commits"
        );
        return;
    }

    const lines = [];

    for (const commit of commits) {
        const sha =
            commit.sha;

        if (!sha) {
            continue;
        }

        const commitUrl =
            `https://github.com/${repo}/commit/${sha}`;

        const shortSha =
            sha.slice(0, 7);

        const message =
            commit.commit?.message
                ?.split("\n")[0]
                ?.trim() ||
            "No commit message";

        lines.push(
            `• <${commitUrl}|${shortSha}> — ${message}`
        );
    }

    if (lines.length === 0) {
        return;
    }

    const text =
        `New commit${lines.length === 1 ? "" : "s"} to ${repo} by 404Navdeep\n` +
        lines.join("\n");

    ctx.logger.info(
        {
            eventId: event.id,
            repo,
            commitCount: lines.length
        },
        "Sending Github push notification"
    );

    await ctx.slack.botClient.chat.postMessage({
        channel: channelId,
        text,
        unfurl_links: false,
        unfurl_media: false
    });

    ctx.logger.info(
        {
            eventId: event.id,
            repo,
            commitCount: lines.length
        },
        "Github push notification sent"
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

    ctx.logger.info(
        {
            repo,
            eventId: event.id
        },
        "Sending Github repository notification"
    );

    const result =
        await ctx.slack.botClient.chat.postMessage({
            channel: channelId,
            text,
            unfurl_links: false,
            unfurl_media: false
        });

    ctx.logger.info(
        {
            ts: result.ts,
            repo
        },
        "Github repository notification sent"
    );
}