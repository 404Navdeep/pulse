// Shared Block Kit helpers so every plugin looks like part of the same product.
//
// Design rules
//  - One header per card (emoji + short title). Never ALL CAPS.
//  - Important facts go in `fields` (two-column grid); prose goes in `section`.
//  - Every card ends with a quiet `footer` context line: "<plugin> · <hint>".
//  - Colour comes from the attachment stripe (see `card`), not from text.
//  - Always send a `text` fallback: it is what notifications and screen readers show.
//
// Slack limits enforced by `clamp`: header 150, section text 3000, field 2000,
// context element 2000, 50 blocks per message, 10 fields per section.

export const COLORS = {
    brand: "#6C5CE7",
    info: "#3B82F6",
    success: "#22C55E",
    warning: "#F59E0B",
    danger: "#EF4444",
    neutral: "#94A3B8"
};

export const clamp = (text, max) => {
    const s = String(text ?? "");
    return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};

/** Escape user/API text for mrkdwn. */
export const esc = text =>
    String(text ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ------------------------------------------------------------------ blocks

export const header = (text, emoji = "") => ({
    type: "header",
    text: { type: "plain_text", text: clamp(emoji ? `${emoji} ${text}` : text, 150), emoji: true }
});

export const section = (md, accessory) => ({
    type: "section",
    text: { type: "mrkdwn", text: clamp(md, 3000) },
    ...(accessory ? { accessory } : {})
});

/** Two-column grid. `pairs` = [[label, value], ...] (max 10). */
export const fields = pairs => ({
    type: "section",
    fields: pairs.slice(0, 10).map(([label, value]) => ({
        type: "mrkdwn",
        text: clamp(`*${label}*\n${value ?? "—"}`, 2000)
    }))
});

export const context = (...parts) => ({
    type: "context",
    elements: parts.flat().filter(Boolean).slice(0, 10).map(p =>
        typeof p === "string" ? { type: "mrkdwn", text: clamp(p, 2000) } : p
    )
});

export const divider = () => ({ type: "divider" });

/** Quiet footer: "plugin · hint". */
export const footer = (plugin, hint) =>
    context(hint ? `*${plugin}*  ·  ${hint}` : `*${plugin}*`);

export const button = (text, actionId, { value, style, url } = {}) => ({
    type: "button",
    text: { type: "plain_text", text: clamp(text, 75), emoji: true },
    action_id: actionId,
    ...(value !== undefined ? { value: String(value) } : {}),
    ...(style ? { style } : {}),
    ...(url ? { url } : {})
});

export const actions = (...elements) => ({ type: "actions", elements: elements.flat() });

// ------------------------------------------------------------------ message shells

/**
 * A card with a coloured stripe down the left edge.
 * Returns an object you can spread into chat.postMessage / respond / say.
 */
export function card({ text, blocks, color = COLORS.brand, ...rest }) {
    // Top-level `text` would render above the stripe (duplicating the card), so the
    // fallback lives on the attachment instead; Slack uses it for notifications.
    return {
        attachments: [{ color, fallback: clamp(text, 300), blocks: blocks.slice(0, 50) }],
        ...rest
    };
}

/** Same as `card` but without the stripe (for dense, neutral content). */
export function plain({ text, blocks, ...rest }) {
    return { text: clamp(text, 300), blocks: blocks.slice(0, 50), ...rest };
}

/** Small one-line notice, e.g. validation errors. Ephemeral by default. */
export function notice(kind, message, { hint, ephemeral = true } = {}) {
    const style = {
        success: [":white_check_mark:", COLORS.success],
        error: [":x:", COLORS.danger],
        warning: [":warning:", COLORS.warning],
        info: [":information_source:", COLORS.info]
    }[kind] ?? [":information_source:", COLORS.info];
    const blocks = [section(`${style[0]}  ${message}`)];
    if (hint) blocks.push(context(hint));
    return card({
        text: String(message).replace(/[*_`~]/g, ""),
        blocks,
        color: style[1],
        ...(ephemeral ? { response_type: "ephemeral" } : {})
    });
}

// ------------------------------------------------------------------ formatting

/** Slack-localised timestamp. Accepts Date, ms, ISO string. */
export function when(time, format = "{date_short_pretty} at {time}") {
    const ms = time instanceof Date ? time.getTime() : typeof time === "number" ? time : Date.parse(time ?? "");
    if (Number.isNaN(ms)) return "—";
    const ts = Math.floor(ms / 1000);
    return `<!date^${ts}^${format}|${new Date(ms).toUTCString()}>`;
}

/** "3h 12m", "45s". */
export function duration(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
    if (d) return `${d}d ${h}h`;
    if (h) return `${h}h ${m}m`;
    if (m) return `${m}m`;
    return `${s}s`;
}

/** ▰▰▰▱▱▱ style meter. ratio 0..1. */
export function meter(ratio, width = 10) {
    const filled = Math.round(Math.min(1, Math.max(0, ratio)) * width);
    return "▰".repeat(filled) + "▱".repeat(width - filled);
}

/** `a  ·  b  ·  c`, skipping empties. */
export const dots = (...parts) => parts.flat().filter(Boolean).join("  ·  ");
