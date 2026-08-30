import axios from "axios";

const SRINAGAR = {
    latitude: 34.0837,
    longitude: 74.7973,
    name: "Srinagar"
};

export default {
    id: "weather",
    name: "Weather",
    version: "0.1.0",

    async init(ctx) {
        ctx.commands.register({
            name: "p-weather",
            description: "Get Srinagar weather",

            async execute({
                command,
                ack,
                ctx
            }) {
                await ack();

                const args =
                    command.text
                        ?.trim()
                        .toLowerCase() || "";

                try {
                    const weather =
                        await getWeather(args);

                    await ctx.slack.botClient.chat.postMessage({
                        channel: command.channel_id,
                        text: weather.text,
                        blocks: weather.blocks
                    });
                } catch (error) {
                    ctx.logger.error(
                        {
                            error: {
                                message: error.message,
                                stack: error.stack
                            }
                        },
                        "Weather not found"
                    );

                    await ctx.slack.botClient.chat.postMessage({
                        channel: command.channel_id,
                        text: ":x: Couldn't get the weather right now."
                    });
                }
            }
        });

        ctx.logger.info("Weather plugin initialized");
    }
};

async function getWeather(args) {
    const dayIndex = parseDay(args);

    const response = await axios.get(
        "https://api.open-meteo.com/v1/forecast",
        {
            params: {
                latitude: SRINAGAR.latitude,
                longitude: SRINAGAR.longitude,
                timezone: "Asia/Kolkata",
                forecast_days: 7,

                current:
                    "temperature_2m," +
                    "relative_humidity_2m," +
                    "apparent_temperature," +
                    "weather_code," +
                    "wind_speed_10m," +
                    "precipitation",

                daily:
                    "weather_code," +
                    "temperature_2m_max," +
                    "temperature_2m_min," +
                    "apparent_temperature_max," +
                    "apparent_temperature_min," +
                    "precipitation_probability_max," +
                    "precipitation_sum," +
                    "wind_speed_10m_max," +
                    "sunrise," +
                    "sunset"
            },

            timeout: 10000
        }
    );

    const data = response.data;
    const daily = data.daily;

    if (
        dayIndex < 0 ||
        dayIndex >= daily.time.length
    ) {
        throw new Error(
            "Hmm seems like the genie knows that!"
        );
    }

    if (dayIndex === 0) {
        return formatToday(data);
    }

    return formatForecastDay(
        data,
        dayIndex
    );
}

function parseDay(args) {
    if (!args || args === "today") {
        return 0;
    }

    if (
        args === "tm" ||
        args === "tomorrow"
    ) {
        return 1;
    }

    const days = [
        "sunday",
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday"
    ];

    const requested =
        days.indexOf(args);

    if (requested === -1) {
        return 0;
    }

    const today = new Date(
        new Date().toLocaleString(
            "en-US",
            {
                timeZone: "Asia/Kolkata"
            }
        )
    ).getDay();

    let difference =
        requested - today;

    if (difference < 0) {
        difference += 7;
    }

    return difference;
}

function formatToday(data) {
    const current = data.current;
    const daily = data.daily;

    const condition =
        weatherDescription(
            current.weather_code
        );

    const emoji =
        weatherEmoji(
            current.weather_code
        );

    const rainChance =
        daily.precipitation_probability_max[0];

    const precipitation =
        daily.precipitation_sum[0];

    const max =
        daily.temperature_2m_max[0];

    const min =
        daily.temperature_2m_min[0];

    const sunrise =
        formatTime(daily.sunrise[0]);

    const sunset =
        formatTime(daily.sunset[0]);

    return {
        text:
            `${emoji} Srinagar weather: ` +
            `${current.temperature_2m}°C, ` +
            `${condition}`,

        blocks: [
            {
                type: "header",

                text: {
                    type: "plain_text",
                    text:
                        `${emoji} Srinagar Weather`
                }
            },

            {
                type: "section",

                fields: [
                    {
                        type: "mrkdwn",

                        text:
                            `:droplet: *Humidity*\n` +
                            `${current.relative_humidity_2m}%`
                    },

                    {
                        type: "mrkdwn",

                        text:
                            `:wind: *Wind*\n` +
                            `${current.wind_speed_10m} km/h`
                    },

                    {
                        type: "mrkdwn",

                        text:
                            `:rain_cloud: *Rain Chance*\n` +
                            `${rainChance}%`
                    },

                    {
                        type: "mrkdwn",

                        text:
                            `:umbrella_with_rain_drops: *Precipitation*\n` +
                            `${precipitation} mm`
                    },

                    {
                        type: "mrkdwn",

                        text:
                            `:upvote: *High*\n` +
                            `${max}°C`
                    },

                    {
                        type: "mrkdwn",

                        text:
                            `:downvote: *Low*\n` +
                            `${min}°C`
                    }
                ]
            },

            {
                type: "context",

                elements: [
                    {
                        type: "mrkdwn",

                        text:
                            `:sunrise_over_mountains: ${sunrise} ` +
                            `- :ms-sunset-city: ${sunset}`
                    }
                ]
            }
        ]
    };
}

function formatForecastDay(
    data,
    index
) {
    const daily = data.daily;

    const date =
        new Date(
            `${daily.time[index]}T12:00:00`
        );

    const dayName =
        date.toLocaleDateString(
            "en-IN",
            {
                weekday: "long"
            }
        );

    const code =
        daily.weather_code[index];

    const condition =
        weatherDescription(code);

    const emoji =
        weatherEmoji(code);

    const max =
        daily.temperature_2m_max[index];

    const min =
        daily.temperature_2m_min[index];

    const apparentMax =
        daily.apparent_temperature_max[index];

    const apparentMin =
        daily.apparent_temperature_min[index];

    const rainChance =
        daily.precipitation_probability_max[index];

    const precipitation =
        daily.precipitation_sum[index];

    const wind =
        daily.wind_speed_10m_max[index];

    const sunrise =
        formatTime(
            daily.sunrise[index]
        );

    const sunset =
        formatTime(
            daily.sunset[index]
        );

    return {
        text:
            `${emoji} Srinagar weather for ` +
            `${dayName}: ${max}/${min}°C`,

        blocks: [
            {
                type: "header",

                text: {
                    type: "plain_text",

                    text:
                        `${emoji} Srinagar - ${dayName}`
                }
            },

            {
                type: "section",

                text: {
                    type: "mrkdwn",

                    text:
                        `*${condition}*\n` +
                        `*${max}°C / ${min}°C*\n` +
                        `Would feel like ` +
                        `${apparentMax}°C / ` +
                        `${apparentMin}°C`
                }
            },

            {
                type: "section",

                fields: [
                    {
                        type: "mrkdwn",

                        text:
                            `:rain_cloud: *Rain Chance*\n` +
                            `${rainChance}%`
                    },

                    {
                        type: "mrkdwn",

                        text:
                            `:umbrella_with_rain_drops: *Precipitation*\n` +
                            `${precipitation} mm`
                    },

                    {
                        type: "mrkdwn",

                        text:
                            `:wind: *Max Wind*\n` +
                            `${wind} km/h`
                    },

                    {
                        type: "mrkdwn",

                        text:
                            `:sunrise_over_mountains: *Sunrise*\n` +
                            `${sunrise}`
                    },

                    {
                        type: "mrkdwn",

                        text:
                            `:ms-sunset-city: *Sunset*\n` +
                            `${sunset}`
                    }
                ]
            }
        ]
    };
}

function formatTime(value) {
    if (!value) {
        return "N/A";
    }

    return new Date(value).toLocaleTimeString(
        "en-IN",
        {
            timeZone: "Asia/Kolkata",
            hour: "numeric",
            minute: "2-digit"
        }
    );
}

function weatherDescription(code) {
    const descriptions = {
        0: "Clear sky",
        1: "Mainly clear",
        2: "Partly cloudy",
        3: "Overcast",
        45: "Fog",
        48: "Depositing rime fog",
        51: "Slight drizzle",
        53: "Moderate drizzle",
        55: "Dense drizzle",
        56: "Light freezing drizzle",
        57: "Dense freezing drizzle",
        61: "Slight rain",
        63: "Moderate rain",
        65: "Heavy rain",
        66: "Light freezing rain",
        67: "Heavy freezing rain",
        71: "Slight snow",
        73: "Moderate snow",
        75: "Heavy snow",
        77: "Snow grains",
        80: "Slight rain showers",
        81: "Moderate rain showers",
        82: "Violent rain showers",
        85: "Slight snow showers",
        86: "Heavy snow showers",
        95: "Thunderstorm",
        96: "Thunderstorm with slight hail",
        99: "Thunderstorm with heavy hail"
    };

    return (
        descriptions[code] ||
        "Unknown weather"
    );
}

function weatherEmoji(code) {
    if (code === 0) {
        return ":sunny:";
    }

    if (
        code === 1 ||
        code === 2 ||
        code === 3
    ) {
        return ":blobby-cloud:";
    }

    if (
        code === 45 ||
        code === 48
    ) {
        return ":white_heart:";
    }

    if (
        code >= 51 &&
        code <= 67
    ) {
        return ":rain_cloud:";
    }

    if (
        code >= 71 &&
        code <= 86
    ) {
        return ":snow_cloud:";
    }

    if (code >= 95) {
        return ":thunder_cloud_and_rain:";
    }

    return ":thermometer:";
}