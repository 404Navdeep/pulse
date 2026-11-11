import fs from "fs/promises";
import path from "path";
import { PROVIDERS, providerById, trackcourier } from "./providers.js";
import {
    COLORS, card, notice, header, section, fields, context, divider, footer, dots, meter
} from "../../core/ui.js";

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

// Colour of the card stripe per status.
const STATUS_COLORS = {
    pending: COLORS.neutral,
    info_received: COLORS.brand,
    in_transit: COLORS.info,
    out_for_delivery: COLORS.warning,
    available_for_pickup: COLORS.success,
    failed_attempt: COLORS.danger,
    exception: COLORS.danger,
    delivered: COLORS.success
};

// Fallback if the courier list can't be fetched at startup.
const DEFAULT_COURIERS = [
    "bluedart", "delhivery", "dtdc", "indiapost", "speedpost", "registeredpost",
    "indiapostinternational", "xpressbees", "shadowfax", "ekart", "trackon",
    "shreemaruti", "professional", "gati", "safexpress", "shiprocket", "stcourier"
].map(slug => ({ slug, name: slug }));

const USAGE_TEXT =
    "/p-track [courier] <tracking id> [label] – start tracking · " +
    "/p-track list – show everything · /p-track remove <tracking id> – stop tracking";

// Usage card. `lead` is an optional notice line shown above the commands.
function usageCard(lead) {
    return card({
        text: lead ? `${lead} ${USAGE_TEXT}` : USAGE_TEXT,
        color: lead ? COLORS.danger : COLORS.brand,
        response_type: "ephemeral",
        blocks: [
            ...(lead ? [section(`:x:  ${lead}`)] : []),
            header("Track Shipment", "📦"),
            section(
                "`/p-track [courier] <tracking id> [label]`\nStart tracking a parcel\n\n" +
                "`/p-track list`\nShow everything being tracked\n\n" +
                "`/p-track remove <tracking id>`\nStop tracking"
            ),
            context("e.g. `/p-track delhivery 1234567890 Headphones`  ·  courier can be left out for India Post IDs like `EE123456789IN`"),
            footer("Track Shipment", "updates land in your personal channel")
        ]
    });
}

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
                    await respond(notice("error", "You don't have permission to use this command."));
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
    const reply = message => respond(message);
    const [first, ...rest] = input.split(/\s+/).filter(Boolean);

    if (!first) {
        return reply(usageCard());
    }

    if (first.toLowerCase() === "list") {
        return respond({ response_type: "ephemeral", ...listMessage() });
    }

    if (first.toLowerCase() === "remove") {
        const number = normaliseNumber(rest[0] ?? "");
        if (!store.shipments[number]) {
            return reply(notice("error", `\`${number || "?"}\` isn't being tracked.`, {
                hint: "`/p-track list` shows everything being tracked"
            }));
        }
        delete store.shipments[number];
        await save();
        return reply(notice("success", `Stopped tracking \`${number}\`.`));
    }

    // `/p-track [courier] <id> [label]`
    let courier = findCourier(first);
    const args = courier ? rest : [first, ...rest];
    const number = normaliseNumber(args[0] ?? "");
    if (!/^[A-Z0-9-]{5,40}$/.test(number)) {
        return reply(usageCard("That doesn't look like a tracking ID."));
    }
    const label = args.slice(1).join(" ").slice(0, 60) || null;
    courier ??= guessCourier(number);

    if (!courier && trackcourier.enabled()) {
        const slugs = [...new Set([...couriers.values()].map(c => `\`${c.slug}\``))];
        return reply(card({
            text: `Which courier is ${number} with? Add it before the ID.`,
            color: COLORS.warning,
            response_type: "ephemeral",
            blocks: [
                section(`:question:  Which courier is \`${number}\` with?`),
                section(`Add it before the ID:\n\`/p-track delhivery ${number}${label ? ` ${label}` : ""}\``),
                divider(),
                context(truncate(`*Couriers*  ${slugs.join("  ")}`, 2000)),
                footer("Track Shipment", "courier can be left out for India Post IDs")
            ]
        }));
    }

    const existing = store.shipments[number];
    if (existing && existing.state !== "delivered") {
        return reply(notice("info", `:eyes:  Already tracking \`${number}\` (${existing.state}).`));
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
        return reply(notice("error", `Couldn't track \`${number}\`: ${result.reason}`));
    }
    if (result.queued && !result.reasons.length) {
        return reply(notice(
            "error",
            `No provider can track ${courier?.name ?? "this courier"} right now.`,
            { hint: "It needs 17TRACK, so add `TRACK17_API_KEY` to `.env`." }
        ));
    }

    store.shipments[number] = shipment;
    await save();

    if (shipment.state === "queued") {
        return reply(notice(
            "warning",
            `:hourglass:  Both free quotas are used up, so \`${number}\` is queued.`,
            { hint: "I'll start tracking it as soon as quota frees up." }
        ));
    }

    await reply(notice(
        "success",
        `Tracking \`${number}\` via *${providerById(shipment.provider).name}*` +
        (shipment.provider === "trackcourier" && trackcourier.usage
            ? ` (${trackcourier.usage.used}/${trackcourier.usage.quota} shipments used)`
            : ""),
        { hint: `Updates will go to <#${process.env.S404PC_CID}>` }
    ));
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
    const lead = isNew ? "📦" : shipment.status === "delivered" ? "✅" : "🚚";

    const blocks = [
        header(headline, lead),
        fields([
            ["Status", `${ms.emoji} ${ms.label}`],
            ["Courier", shipment.courier ? escape(shipment.courier) : "_Detecting…_"],
            ["Tracking ID", `\`${shipment.number}\``],
            ["Last update", latest?.time ? slackDate(latest.time) : "_None yet_"]
        ]),
        context(progressBar(shipment.status))
    ];

    if (sorted.length) {
        blocks.push(divider());
        const shown = sorted.slice(0, MAX_EVENTS_SHOWN);
        const lines = shown.map(e => {
            const em = MILESTONES[e.status]?.emoji ?? ":small_blue_diamond:";
            const meta = dots(
                e.location && `:round_pushpin: ${escape(e.location)}`,
                e.time && slackDate(e.time)
            );
            return `${em}  *${escape(truncate(e.text, 200))}*${meta ? `\n      ${meta}` : ""}`;
        });
        blocks.push(section(
            `*${isNew ? "Latest events" : sorted.length === 1 ? "New update" : `${sorted.length} new updates`}*\n\n` +
            lines.join("\n\n")
        ));
        if (sorted.length > MAX_EVENTS_SHOWN) {
            blocks.push(context(`+${sorted.length - MAX_EVENTS_SHOWN} older updates`));
        }
    } else if (isNew) {
        blocks.push(context(":hourglass_flowing_sand:  Waiting for the first scan. I'll post it here as soon as it appears."));
    }

    const active = Object.values(store.shipments).filter(s => s.state === "active").length;
    blocks.push(footer(
        "Track Shipment",
        dots(
            `via ${providerById(shipment.provider)?.name ?? "?"}`,
            `tracking ${active} shipment${active === 1 ? "" : "s"}`,
            "`/p-track list`"
        )
    ));

    await ctx.slack.botClient.chat.postMessage({
        channel: process.env.S404PC_CID,
        ...card({
            text: `${ms.emoji} ${headline}` +
                (latest && !headline.toLowerCase().endsWith(latest.text.toLowerCase()) ? ` — ${latest.text}` : ""),
            blocks,
            color: STATUS_COLORS[shipment.status] ?? COLORS.brand
        }),
        unfurl_links: false
    });
}

// Packs lines into section blocks that stay under Slack's 3000 char limit.
function packLines(heading, lines, max = 2800) {
    const out = [];
    let cur = heading;
    for (const line of lines) {
        if (cur.length + line.length + 2 > max && cur !== heading) {
            out.push(section(cur));
            cur = "";
        }
        cur = cur ? `${cur}\n\n${line}` : line;
    }
    if (cur) out.push(section(cur));
    return out;
}

function listMessage() {
    const all = Object.values(store.shipments).sort((a, b) => b.updatedAt - a.updatedAt);
    if (!all.length) {
        return card({
            text: "Nothing is being tracked. Add one with /p-track <tracking id>.",
            color: COLORS.neutral,
            blocks: [
                section(":package:  *Nothing is being tracked yet.*"),
                context("Add one with `/p-track <tracking id>`"),
                footer("Track Shipment")
            ]
        });
    }
    const groups = [
        ["active", "Active", ":truck:"],
        ["queued", "Queued · waiting for quota", ":hourglass_flowing_sand:"],
        ["delivered", "Delivered", ":white_check_mark:"]
    ];
    const counts = groups
        .map(([state, heading]) => [heading.split(" ")[0], all.filter(s => s.state === state).length])
        .filter(([, n]) => n);

    const blocks = [
        header("Tracked shipments", "📦"),
        context(dots(counts.map(([label, n]) => `*${n}* ${label.toLowerCase()}`)))
    ];
    for (const [state, heading, icon] of groups) {
        const items = all.filter(s => s.state === state);
        if (!items.length) continue;
        blocks.push(divider());
        const lines = items.map(s => {
            const ms = MILESTONES[s.status] ?? MILESTONES.pending;
            const name = s.label ? escape(s.label) : `\`${s.number}\``;
            const id = s.label ? `  \`${s.number}\`` : "";
            const meta = dots(
                `${ms.emoji} ${ms.label}`,
                s.courier && escape(s.courier),
                s.updatedAt && `updated ${slackDate(s.updatedAt, "{date_short_pretty}")}`
            );
            return `*${name}*${id}\n      ${meta}`;
        });
        blocks.push(...packLines(`${icon}  *${heading}*`, lines));
    }
    blocks.push(footer(
        "Track Shipment",
        dots(
            trackcourier.usage && `trackcourier.io ${trackcourier.usage.used}/${trackcourier.usage.quota} used`,
            "`/p-track remove <id>` to stop"
        )
    ));
    return card({ text: `Tracking ${all.length} shipment${all.length === 1 ? "" : "s"}`, blocks, color: COLORS.brand });
}

// Compact stage tracker, e.g. "▰▰▰▱  *In transit*  ·  step 2 of 4".
function progressBar(status) {
    if (["exception", "failed_attempt"].includes(status)) {
        return `${MILESTONES[status].emoji} *${MILESTONES[status].label}* – may need attention`;
    }
    const reached = status === "available_for_pickup" ? 2 : PROGRESS.indexOf(status);
    const label = MILESTONES[status]?.label ?? MILESTONES.pending.label;
    if (reached < 0) {
        return `${meter(0, PROGRESS.length * 2)}  _Waiting for the first scan_`;
    }
    const step = Math.min(reached + 1, PROGRESS.length);
    return `${meter(step / PROGRESS.length, PROGRESS.length * 2)}  *${label}*  ·  step ${step} of ${PROGRESS.length}`;
}

// ------------------------------------------------------------ helpers

function toTs(time) {
    const t = Date.parse(time ?? "");
    return Number.isNaN(t) ? 0 : t;
}

function slackDate(time, format = "{date_short_pretty} at {time}") {
    const ts = Math.floor(toTs(time) / 1000);
    if (!ts) return escape(String(time));
    return `<!date^${ts}^${format}|${new Date(ts * 1000).toUTCString()}>`;
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
