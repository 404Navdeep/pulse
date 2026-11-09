import fs from "fs/promises";
import path from "path";
import { PROVIDERS, providerById, trackcourier } from "./providers.js";

const POLL_MS = 60 * 1000;               // check active shipments every minute
const QUEUE_RETRY_MS = 6 * 60 * 60 * 1000; // retry queued IDs every 6 h
const MAX_EVENTS_SHOWN = 5;
const DATA_FILE = path.resolve("data", "shipments.json");

const MILESTONES = {
    pending: { emoji: ":hourglass_flowing_sand:", label: "Pending" },
    info_received: { emoji: ":memo:", label: "Info received" },
    in_transit: { emoji: ":package:", label: "In transit" },
    out_for_delivery: { emoji: ":truck:", label: "Out for delivery" },
    available_for_pickup: { emoji: ":convenience_store:", label: "Ready for pickup" },
    failed_attempt: { emoji: ":x:", label: "Delivery attempt failed" },
    exception: { emoji: ":warning:", label: "Exception" },
    delivered: { emoji: ":white_check_mark:", label: "Delivered" }
};

const PROGRESS = ["info_received", "in_transit", "out_for_delivery", "delivered"];

// Fallback if the courier list can't be fetched at startup.
const DEFAULT_COURIERS = [
    "bluedart", "delhivery", "dtdc", "indiapost", "speedpost", "registeredpost",
    "indiapostinternational", "xpressbees", "shadowfax", "ekart", "trackon",
    "shreemaruti", "professional", "gati", "safexpress", "shiprocket", "stcourier"
].map(slug => ({ slug, name: slug }));

const USAGE =
    ":package: *Track Shipment*\n" +
    "`/p-track [courier] <tracking id> [label]` – start tracking\n" +
    "   e.g. `/p-track delhivery 1234567890 Headphones` (courier can be left out for India Post IDs like `EE123456789IN`)\n" +
    "`/p-track list` – show everything being tracked\n" +
    "`/p-track remove <tracking id>` – stop tracking";

// shipments: { [trackingNumber]: Shipment }
// Shipment: { number, label, provider, ref, state: "active"|"queued"|"delivered",
//             status, courier, seen: [eventIds], addedAt, updatedAt }
let store = { shipments: {}, lastQueueRetry: 0 };
let polling = false;
let couriers = new Map(); // normalised slug/name -> { slug, name }
let tcSlugs = new Set();  // slugs trackcourier.io supports

const EXTRA_COURIERS = [{ slug: "fedex", name: "FedEx" }];

export default {
    id: "track-shipment",
    name: "Track Shipment",
    version: "0.1.0",

    async init(ctx) {
        if (!process.env.S404PC_CID) {
            throw new Error("S404PC_CID is not configured");
        }
        if (!PROVIDERS.some(p => p.enabled())) {
            throw new Error("Set TRACKCOURIER_API_KEY and/or TRACK17_API_KEY");
        }

        await load();
        await loadCouriers(ctx);

        ctx.commands.register({
            name: "p-track",
            description: "Track a shipment",
            ownerOnly: true,
            async execute({ command, ack, respond, ctx }) {
                await ack();
                if (process.env.OWNER_ID && command.user_id !== process.env.OWNER_ID) {
                    await respond({
                        response_type: "ephemeral",
                        text: "You dont have permission to use this command."
                    });
                    return;
                }
                await handleCommand(command.text?.trim() ?? "", respond, ctx);
            }
        });

        const interval = setInterval(() => poll(ctx), POLL_MS);
        ctx.state.set("trackShipment.interval", interval);
        poll(ctx);

        ctx.logger.info(
            `Track Shipment initialized (${Object.keys(store.shipments).length} saved, ` +
            `providers: ${PROVIDERS.filter(p => p.enabled()).map(p => p.name).join(", ")})`
        );
    }
};

// ------------------------------------------------------------ commands

async function handleCommand(input, respond, ctx) {
    const reply = text => respond({ response_type: "ephemeral", text });
    const [first, ...rest] = input.split(/\s+/).filter(Boolean);

    if (!first) {
        return reply(USAGE);
    }

    if (first.toLowerCase() === "list") {
        return respond({ response_type: "ephemeral", ...listMessage() });
    }

    if (first.toLowerCase() === "remove") {
        const number = normaliseNumber(rest[0] ?? "");
        if (!store.shipments[number]) {
            return reply(`:x: \`${number || "?"}\` isn't being tracked.`);
        }
        delete store.shipments[number];
        await save();
        return reply(`:wastebasket: Stopped tracking \`${number}\`.`);
    }

    // `/p-track [courier] <id> [label]`
    let courier = findCourier(first);
    const args = courier ? rest : [first, ...rest];
    const number = normaliseNumber(args[0] ?? "");
    if (!/^[A-Z0-9-]{5,40}$/.test(number)) {
        return reply(":x: That doesn't look like a tracking ID.\n\n" + USAGE);
    }
    const label = args.slice(1).join(" ").slice(0, 60) || null;
    courier ??= guessCourier(number);

    if (!courier && trackcourier.enabled()) {
        const slugs = [...new Set([...couriers.values()].map(c => `\`${c.slug}\``))];
        return reply(
            `:question: Which courier is \`${number}\` with? Add it before the ID, e.g.\n` +
            `\`/p-track delhivery ${number}${label ? ` ${label}` : ""}\`\n\n` +
            `Couriers: ${slugs.join(", ")}`
        );
    }

    const existing = store.shipments[number];
    if (existing && existing.state !== "delivered") {
        return reply(`:eyes: Already tracking \`${number}\` (${existing.state}).`);
    }

    const shipment = {
        number,
        label,
        provider: null,
        ref: null,
        courierSlug: courier?.slug ?? null,
        state: "queued",
        status: "pending",
        courier: null,
        seen: [],
        addedAt: Date.now(),
        updatedAt: Date.now()
    };

    const result = await registerShipment(shipment, ctx);

    if (result.invalid) {
        return reply(`:x: Couldn't track \`${number}\`: ${result.reason}`);
    }
    if (result.queued && !result.reasons.length) {
        return reply(
            `:x: No provider can track ${courier?.name ?? "this courier"} right now. ` +
            "It needs 17TRACK, so add `TRACK17_API_KEY` to `.env`."
        );
    }

    store.shipments[number] = shipment;
    await save();

    if (shipment.state === "queued") {
        return reply(
            `:hourglass: Both free quotas are used up, so \`${number}\` is queued. ` +
            "I'll start tracking it as soon as quota frees up."
        );
    }

    await reply(
        `:white_check_mark: Tracking \`${number}\` via ${providerById(shipment.provider).name}` +
        (shipment.provider === "trackcourier" && trackcourier.usage
            ? ` (${trackcourier.usage.used}/${trackcourier.usage.quota} shipments used). `
            : ". ") +
        "Updates will go to <#" + process.env.S404PC_CID + ">."
    );
    await postUpdate(ctx, shipment, result.info.events, { isNew: true });
}

function normaliseNumber(raw) {
    return raw.toUpperCase().replace(/\s+/g, "");
}

function courierKey(text) {
    return String(text).toLowerCase().replace(/[\s_-]+/g, "");
}

function findCourier(token) {
    return couriers.get(courierKey(token)) ?? null;
}

// India Post style: 2 letters, 9 digits, 2 letters (EE123456789IN).
function guessCourier(number) {
    if (!/^[A-Z]{2}\d{9}[A-Z]{2}$/.test(number)) return null;
    return findCourier(number.endsWith("IN") ? "indiapost" : "indiapostinternational");
}

async function loadCouriers(ctx) {
    let list = DEFAULT_COURIERS;
    if (trackcourier.enabled()) {
        try {
            const fetched = await trackcourier.couriers(); // free call
            if (fetched.length) list = fetched;
        } catch (error) {
            ctx.logger.warn({ error: error.message }, "Couldn't load courier list, using defaults");
        }
    }
    couriers = new Map();
    tcSlugs = new Set(list.map(c => c.slug));
    // Couriers trackcourier.io may not cover; these fall through to 17TRACK.
    for (const c of [...list, ...EXTRA_COURIERS]) {
        if (couriers.has(courierKey(c.slug))) continue;
        couriers.set(courierKey(c.slug), c);
        couriers.set(courierKey(c.name), c);
    }
}

// Tries each provider in order. Mutates `shipment` on success.
async function registerShipment(shipment, ctx) {
    const reasons = [];
    for (const provider of PROVIDERS) {
        if (!provider.enabled()) continue;
        if (provider.needsCourier && !tcSlugs.has(shipment.courierSlug)) continue;
        try {
            const { ref, info } = await provider.register(shipment);
            shipment.provider = provider.id;
            shipment.ref = ref;
            shipment.state = "active";
            applyInfo(shipment, info);
            shipment.seen = info.events.map(e => e.id);
            ctx.logger.info({ number: shipment.number, provider: provider.id }, "Shipment registered");
            return { info };
        } catch (error) {
            ctx.logger.warn({ number: shipment.number, provider: provider.id, error: error.message }, "Register failed");
            if (error.invalid) {
                return { invalid: true, reason: error.message };
            }
            reasons.push(error.message);
        }
    }
    return { queued: true, reasons };
}

// ------------------------------------------------------------ polling

async function poll(ctx) {
    if (polling) return;
    polling = true;
    try {
        for (const shipment of Object.values(store.shipments)) {
            if (shipment.state !== "active") continue;
            try {
                await checkShipment(ctx, shipment);
            } catch (error) {
                ctx.logger.error({ number: shipment.number, error: error.message }, "Shipment check failed");
            }
            await new Promise(r => setTimeout(r, 600)); // stay under 2 req/s
        }

        if (Date.now() - store.lastQueueRetry > QUEUE_RETRY_MS) {
            store.lastQueueRetry = Date.now();
            await retryQueue(ctx);
        }
        await save();
    } finally {
        polling = false;
    }
}

async function checkShipment(ctx, shipment) {
    const provider = providerById(shipment.provider);
    if (!provider?.enabled()) return;
    const info = await provider.fetch(shipment);
    const seen = new Set(shipment.seen);
    const fresh = info.events.filter(e => !seen.has(e.id));
    const statusChanged = info.status !== shipment.status;

    applyInfo(shipment, info);
    if (!fresh.length && !statusChanged) return;

    shipment.seen = info.events.map(e => e.id);
    shipment.updatedAt = Date.now();
    if (shipment.status === "delivered") {
        shipment.state = "delivered";
    }
    await postUpdate(ctx, shipment, fresh);
}

async function retryQueue(ctx) {
    for (const shipment of Object.values(store.shipments)) {
        if (shipment.state !== "queued") continue;
        const result = await registerShipment(shipment, ctx);
        if (result.invalid) {
            delete store.shipments[shipment.number];
            continue;
        }
        if (result.queued) return; // still no quota anywhere; try again later
        await postUpdate(ctx, shipment, result.info.events, { isNew: true });
    }
}

function applyInfo(shipment, info) {
    shipment.status = info.status ?? shipment.status;
    shipment.courier = info.courier ?? shipment.courier;
}

// ------------------------------------------------------------ Block Kit

async function postUpdate(ctx, shipment, events, { isNew = false } = {}) {
    const ms = MILESTONES[shipment.status] ?? MILESTONES.pending;
    const title = shipment.label ?? shipment.number;
    const sorted = [...events].sort((a, b) => toTs(b.time) - toTs(a.time));
    const latest = sorted[0];

    const headline = isNew
        ? `Now tracking ${title}`
        : shipment.status === "delivered"
            ? `${title} was delivered!`
            : `${title}: ${ms.label}`;

    const blocks = [
        {
            type: "header",
            text: { type: "plain_text", text: truncate(`${isNew ? "📦" : "🚚"} ${headline}`, 150), emoji: true }
        },
        {
            type: "section",
            fields: [
                { type: "mrkdwn", text: `*Status*\n${ms.emoji} ${ms.label}` },
                { type: "mrkdwn", text: `*Courier*\n${shipment.courier ? escape(shipment.courier) : "_Detecting…_"}` },
                { type: "mrkdwn", text: `*Tracking ID*\n\`${shipment.number}\`` },
                {
                    type: "mrkdwn",
                    text: `*Last update*\n${latest?.time ? slackDate(latest.time) : "_None yet_"}`
                }
            ]
        },
        {
            type: "context",
            elements: [{ type: "mrkdwn", text: progressBar(shipment.status) }]
        }
    ];

    if (sorted.length) {
        blocks.push({ type: "divider" });
        const shown = sorted.slice(0, MAX_EVENTS_SHOWN);
        const lines = shown.map(e => {
            const em = MILESTONES[e.status]?.emoji ?? ":small_blue_diamond:";
            const meta = [e.location && `:round_pushpin: ${escape(e.location)}`, e.time && slackDate(e.time)]
                .filter(Boolean)
                .join("  ·  ");
            return `${em} *${escape(truncate(e.text, 200))}*${meta ? `\n${meta}` : ""}`;
        });
        blocks.push({
            type: "section",
            text: {
                type: "mrkdwn",
                text: truncate(
                    `*${isNew ? "Latest events" : sorted.length === 1 ? "New update" : `${sorted.length} new updates`}*\n\n` +
                    lines.join("\n\n"),
                    2900
                )
            }
        });
        if (sorted.length > MAX_EVENTS_SHOWN) {
            blocks.push({
                type: "context",
                elements: [{ type: "mrkdwn", text: `+${sorted.length - MAX_EVENTS_SHOWN} older updates` }]
            });
        }
    }

    const active = Object.values(store.shipments).filter(s => s.state === "active").length;
    blocks.push({
        type: "context",
        elements: [
            {
                type: "mrkdwn",
                text:
                    `via ${providerById(shipment.provider)?.name ?? "?"}  ·  ` +
                    `tracking ${active} shipment${active === 1 ? "" : "s"}  ·  \`/p-track list\``
            }
        ]
    });

    await ctx.slack.botClient.chat.postMessage({
        channel: process.env.S404PC_CID,
        text: `${ms.emoji} ${headline}` +
            (latest && !headline.toLowerCase().endsWith(latest.text.toLowerCase()) ? ` — ${latest.text}` : ""),
        blocks,
        unfurl_links: false
    });
}

function listMessage() {
    const all = Object.values(store.shipments).sort((a, b) => b.updatedAt - a.updatedAt);
    if (!all.length) {
        return { text: ":package: Nothing is being tracked. Add one with `/p-track <tracking id>`." };
    }
    const groups = [
        ["active", "Active"],
        ["queued", "Queued (waiting for quota)"],
        ["delivered", "Delivered"]
    ];
    const blocks = [{ type: "header", text: { type: "plain_text", text: "📦 Tracked shipments" } }];
    for (const [state, heading] of groups) {
        const items = all.filter(s => s.state === state);
        if (!items.length) continue;
        blocks.push({
            type: "section",
            text: {
                type: "mrkdwn",
                text: truncate(
                    `*${heading}*\n` +
                    items.map(s => {
                        const ms = MILESTONES[s.status] ?? MILESTONES.pending;
                        const name = s.label ? `${escape(s.label)} · ` : "";
                        return `${ms.emoji} ${name}\`${s.number}\` – ${ms.label}` +
                            (s.courier ? ` (${escape(s.courier)})` : "");
                    }).join("\n"),
                    2900
                )
            }
        });
    }
    if (trackcourier.usage) {
        const { used, quota } = trackcourier.usage;
        blocks.push({
            type: "context",
            elements: [{ type: "mrkdwn", text: `trackcourier.io: ${used}/${quota} shipments used` }]
        });
    }
    return { text: `Tracking ${all.length} shipments`, blocks };
}

function progressBar(status) {
    if (["exception", "failed_attempt"].includes(status)) {
        return `${MILESTONES[status].emoji} *${MILESTONES[status].label}* – may need attention`;
    }
    const reached = status === "available_for_pickup" ? 2 : PROGRESS.indexOf(status);
    return PROGRESS.map((step, i) => {
        const label = MILESTONES[step].label;
        if (i < reached) return `:large_green_circle: ~${label}~`;
        if (i === reached) return `:large_green_circle: *${label}*`;
        return `:white_circle: ${label}`;
    }).join("  →  ");
}

// ------------------------------------------------------------ helpers

function toTs(time) {
    const t = Date.parse(time ?? "");
    return Number.isNaN(t) ? 0 : t;
}

function slackDate(time) {
    const ts = Math.floor(toTs(time) / 1000);
    if (!ts) return escape(String(time));
    return `<!date^${ts}^{date_short_pretty} at {time}|${new Date(ts * 1000).toUTCString()}>`;
}

function escape(text) {
    return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function truncate(text, max) {
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

async function load() {
    try {
        store = { shipments: {}, lastQueueRetry: 0, ...JSON.parse(await fs.readFile(DATA_FILE, "utf8")) };
    } catch (error) {
        if (error.code !== "ENOENT") throw error;
    }
}

async function save() {
    await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
    const tmp = `${DATA_FILE}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(store, null, 2));
    await fs.rename(tmp, DATA_FILE);
}
