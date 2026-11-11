import axios from "axios";
import {
    COLORS,
    card,
    notice,
    header,
    section,
    fields,
    context,
    divider,
    footer,
    meter,
    dots
} from "../../core/ui.js";

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
                        ...weather
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
                        ...notice(
                            "error",
                            "Couldn't get the weather right now.",
                            {
                                ephemeral: false,
                                hint: "Try `/p-weather`, `/p-weather tomorrow` or a weekday like `/p-weather friday`."
                            }
                        )
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

// ------------------------------------------------------------------ presentation

const FOOTER_HINT = "Open-Meteo  ·  `/p-weather tomorrow` or a weekday";

const rainMeter = pct =>
    `${meter((Number(pct) || 0) / 100, 8)}  ${pct ?? 0}%`;

const humidityMeter = pct =>
    `${meter((Number(pct) || 0) / 100, 8)}  ${pct ?? 0}%`;

function formatToday(data) {
    const current = data.current;
    const daily = data.daily;

    const code = current.weather_code;
    const condition = weatherDescription(code);
    const emoji = weatherEmoji(code);

    const rainChance = daily.precipitation_probability_max[0];
    const precipitation = daily.precipitation_sum[0];
    const max = daily.temperature_2m_max[0];
    const min = daily.temperature_2m_min[0];
    const sunrise = formatTime(daily.sunrise[0]);
    const sunset = formatTime(daily.sunset[0]);

    const blocks = [
        header(`${SRINAGAR.name} · Today`, emoji),

        section(
            `*${current.temperature_2m}°C*  ${condition}\n` +
            `Feels like *${current.apparent_temperature}°C*  ·  ` +
            `High *${max}°*  /  Low *${min}°*`
        ),

        fields([
            [":droplet: Humidity", humidityMeter(current.relative_humidity_2m)],
            [":cloud: Rain chance", rainMeter(rainChance)],
            [":dash: Wind", `${current.wind_speed_10m} km/h`],
            [":umbrella_with_rain_drops: Precipitation", `${precipitation} mm`]
        ]),

        context(
            dots(
                `:sunrise_over_mountains: Sunrise *${sunrise}*`,
                `:city_sunset: Sunset *${sunset}*`
            )
        )
    ];

    const outlook = nextDaysOutlook(daily, 3);
    if (outlook) {
        blocks.push(divider(), section(`*Coming up*\n${outlook}`));
    }

    blocks.push(footer("Weather", FOOTER_HINT));

    return card({
        text:
            `${emoji} Srinagar weather: ` +
            `${current.temperature_2m}°C, ` +
            `${condition}`,
        blocks,
        color: weatherColor(code)
    });
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

    const dateLabel =
        date.toLocaleDateString(
            "en-IN",
            {
                day: "numeric",
                month: "short"
            }
        );

    const code = daily.weather_code[index];
    const condition = weatherDescription(code);
    const emoji = weatherEmoji(code);

    const max = daily.temperature_2m_max[index];
    const min = daily.temperature_2m_min[index];
    const apparentMax = daily.apparent_temperature_max[index];
    const apparentMin = daily.apparent_temperature_min[index];
    const rainChance = daily.precipitation_probability_max[index];
    const precipitation = daily.precipitation_sum[index];
    const wind = daily.wind_speed_10m_max[index];
    const sunrise = formatTime(daily.sunrise[index]);
    const sunset = formatTime(daily.sunset[index]);

    return card({
        text:
            `${emoji} Srinagar weather for ` +
            `${dayName}: ${max}/${min}°C`,
        color: weatherColor(code),
        blocks: [
            header(`${SRINAGAR.name} · ${dayName}`, emoji),

            section(
                `*${max}°C*  /  *${min}°C*  ·  ${condition}\n` +
                `Would feel like ${apparentMax}°C / ${apparentMin}°C`
            ),

            fields([
                [":cloud: Rain chance", rainMeter(rainChance)],
                [":umbrella_with_rain_drops: Precipitation", `${precipitation} mm`],
                [":dash: Max wind", `${wind} km/h`],
                [":calendar: Date", dateLabel]
            ]),

            context(
                dots(
                    `:sunrise_over_mountains: Sunrise *${sunrise}*`,
                    `:city_sunset: Sunset *${sunset}*`
                )
            ),

            footer("Weather", FOOTER_HINT)
        ]
    });
}

// Compact "next N days" lines built from data we already fetched.
function nextDaysOutlook(daily, count) {
    const lines = [];

    for (let i = 1; i <= count && i < daily.time.length; i++) {
        const day = new Date(`${daily.time[i]}T12:00:00`)
            .toLocaleDateString("en-IN", { weekday: "short" });

        lines.push(
            `${weatherEmoji(daily.weather_code[i])} *${day}*  ` +
            `${daily.temperature_2m_max[i]}° / ${daily.temperature_2m_min[i]}°  ·  ` +
            `${daily.precipitation_probability_max[i] ?? 0}% rain`
        );
    }

    return lines.join("\n");
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

    if (code === 1) {
        return ":mostly_sunny:";
    }

    if (code === 2) {
        return ":partly_sunny:";
    }

    if (code === 3) {
        return ":cloud:";
    }

    if (
        code === 45 ||
        code === 48
    ) {
        return ":fog:";
    }

    if (
        (code >= 51 && code <= 67) ||
        (code >= 80 && code <= 82)
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

// Stripe colour that matches the sky.
function weatherColor(code) {
    if (code === 0 || code === 1) {
        return COLORS.warning;
    }

    if (code === 2 || code === 3 || code === 45 || code === 48) {
        return COLORS.neutral;
    }

    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) {
        return COLORS.info;
    }

    if (code >= 71 && code <= 86) {
        return "#BAE6FD";
    }

    if (code >= 95) {
        return COLORS.danger;
    }

    return COLORS.brand;
}
