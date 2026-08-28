import axios from "axios";

let runtimeState = {
    date: null,
    startedSent: false,
    projectHours: new Map(),
    languageSent: new Set(),
    checking: false
};

export default {
    id: "hacktime",
    name: "Hackatime",
    version: "0.2.0",

    async init(ctx) {
        const channelId =
            process.env.S404PC_CID;

        const apiKey =
            process.env.HACKATIME_API_KEY;

        if (!apiKey) {
            throw new Error(
                "HACKATIME_API_KEY is not configured"
            );
        }

        if (!channelId) {
            throw new Error(
                "S404PC_CID is not configured"
            );
        }

        resetForToday();

        await checkHackatime(ctx);

        const interval = setInterval(
            () => {
                checkHackatime(ctx).catch(error => {
                    ctx.logger.error(
                        {
                            error: {
                                message: error.message,
                                stack: error.stack
                            }
                        },
                        "Hackatime check failed"
                    );
                });
            },
            60 * 1000
        );

        ctx.state.set(
            "hackatime.interval",
            interval
        );

        ctx.logger.info(
            "Hackatime plugin initialized"
        );
    }
};

async function checkHackatime(ctx) {
    if (runtimeState.checking) {
        return;
    }

    runtimeState.checking = true;

    try {
        const today =
            getDateKey();

        if (
            runtimeState.date !== today
        ) {
            resetForToday();
        }

        const startDate =
            `${today}T00:00:00+05:30`;

        const endDate =
            `${today}T23:59:59+05:30`;

        const response =
            await axios.get(
                "https://hackatime.hackclub.com/api/v1/users/my/stats",
                {
                    params: {
                        start_date: startDate,
                        end_date: endDate,
                        features: "languages,projects",
                        boundary_aware: "true",
                        total_seconds: "false",
                        no_ai_coding: "true"
                    },

                    headers: {
                        Authorization:
                            `Bearer ${process.env.HACKATIME_API_KEY}`
                    },

                    timeout: 15000
                }
            );

        const data =
            response.data?.data;

        if (!data) {
            throw new Error(
                "Hackatime returned no stats"
            );
        }

        const totalSeconds =
            Number(
                data.total_seconds || 0
            );

        /*
         * 0 seconds -> coding started
         */
        if (
            totalSeconds > 0 &&
            !runtimeState.startedSent
        ) {
            await sendNotification(
                ctx,
                "Wohoo coding started!"
            );

            runtimeState.startedSent = true;

            ctx.logger.info(
                "Hackatime start notification sent"
            );
        }

        /*
         * hour coded on a project -> project notification
         */
        const projects = 
            Array.isArray(data.projects)
                ? data.projects
                : [];
        for (const project of projects) {
            const name = project?.name;
            const seconds = Number(project?.total_seconds || 0);
            if (!name || seconds < 3600) {
                continue;
            }
            const key = name.toLowerCase();
            const lastSent = runtimeState.projectHours.get(key) || 0;
            if (hours <= lastSent) {
                continue;
            }
            for (let hour = lastSent + 1;
                hour <= hours;
                hour++
            ) {
                await sendNotification(ctx,
                    `:mhm: ${hour}hr coded on ${name}!`
                );
                ctx.logger.info({
                    project: name,
                    hour,
                    seconds
                }, "Hackatime project hour notification sent");
            }

            runtimeState.projectHours.set(
                key,
                hours
            );
        }

        /*
         * 1 hour on a language -> language notification
         */
        if (totalSeconds > 3600) {
            const languages =
                Array.isArray(
                    data.languages
                )
                    ? data.languages
                    : [];

            for (const language of languages) {
                const name =
                    language?.name;

                const seconds =
                    Number(
                        language?.total_seconds || 0
                    );

                if (!name) {
                    continue;
                }

                if (seconds <= 3600) {
                    continue;
                }

                const key =
                    name.toLowerCase();

                if (
                    runtimeState.languageSent.has(
                        key
                    )
                ) {
                    continue;
                }

                await sendNotification(
                    ctx,
                    `:yay: +1 to :${normaliseLanguage(name)}:`
                );

                runtimeState.languageSent.add(
                    key
                );

                ctx.logger.info(
                    {
                        language: name,
                        seconds
                    },
                    "Hackatime language notification sent"
                );
            }
        }

        ctx.logger.info(
            {
                totalSeconds,
                startedSent:
                    runtimeState.startedSent,
                projectHourNotification:
                    runtimeState.projectHours.size,
                languageNotifications:
                    runtimeState.languageSent.size
            },
            "Hackatime stats checked"
        );
    } finally {
        runtimeState.checking = false;
    }
}

function resetForToday() {
    runtimeState = {
        date: getDateKey(),
        startedSent: false,
        projectHours: new Map(),
        languageSent: new Set(),
        checking: false
    };
}

function normaliseLanguage(language) {
    return language
        .toLowerCase()
        .replace(
            /[^a-z0-9_+-]/g,
            ""
        );
}

async function sendNotification(
    ctx,
    text
) {
    await ctx.slack.botClient.chat.postMessage({
        channel:
            process.env.S404PC_CID,

        text
    });
}

function getDateKey() {
    return new Intl.DateTimeFormat(
        "en-CA",
        {
            timeZone: "Asia/Kolkata",
            year: "numeric",
            month: "2-digit",
            day: "2-digit"
        }
    ).format(new Date());
}