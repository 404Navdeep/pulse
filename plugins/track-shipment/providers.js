// Tracking providers. Each one normalises its API into the same shape:
//   { status, courier, events: [{ id, time, text, location, status }] }
// `status` is one of the MILESTONES keys in main.js.

const TIMEOUT = 20000;

export class ProviderError extends Error {
    constructor(message, { quota = false, invalid = false } = {}) {
        super(message);
        this.quota = quota;     // provider is out of free quota
        this.invalid = invalid; // tracking number was rejected
    }
}

async function request(url, { headers, body, method = "POST" }) {
    const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT)
    });
    let json = null;
    try {
        json = await res.json();
    } catch {
        // non-JSON body
    }
    return { status: res.status, json };
}

// ---------------------------------------------------------------- trackcourier.io

const TC_URL = "https://api.trackcourier.io/v1";

const TC_STATUS = {
    inforeceived: "info_received",
    pending: "pending",
    intransit: "in_transit",
    outfordelivery: "out_for_delivery",
    attemptfail: "failed_attempt",
    delivered: "delivered",
    exception: "exception",
    expired: "exception"
};

const TC_QUOTA = ["NO_SHIPMENTS_LEFT", "QUOTA_EXCEEDED", "ACCOUNT_NEEDS_ATTENTION"];
const TC_INVALID = ["INVALID_TRACKING_NUMBER", "COURIER_NOT_FOUND", "COURIER_NOT_SUPPORTED"];

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

export const trackcourier = {
    id: "trackcourier",
    name: "trackcourier.io",
    needsCourier: true,
    usage: null, // last { used, quota, plan } the API reported

    enabled() {
        return Boolean(process.env.TRACKCOURIER_API_KEY);
    },

    async track(courier, number) {
        const url = `${TC_URL}/track?courier=${encodeURIComponent(courier)}` +
            `&tracking_number=${encodeURIComponent(number)}`;
        const { status, json } = await request(url, {
            method: "GET",
            headers: { "X-API-Key": process.env.TRACKCOURIER_API_KEY }
        });
        if (json?.usage) this.usage = json.usage;
        if (json?.success) return this.normalise(json.data);

        // Docs: branch on error.code, the HTTP status can vary.
        const code = json?.error?.code ?? `HTTP_${status}`;
        let message = `trackcourier.io ${code}: ${json?.error?.message?.split("\n")[0] ?? "request failed"}`;
        if (json?.error?.did_you_mean) message += ` (did you mean \`${json.error.did_you_mean}\`?)`;
        throw new ProviderError(message, {
            quota: TC_QUOTA.includes(code),
            invalid: TC_INVALID.includes(code)
        });
    },

    // The first lookup of a parcel uses 1 shipment; later lookups are free.
    async register(shipment) {
        if (!shipment.courierSlug) {
            throw new ProviderError("trackcourier.io needs a courier");
        }
        const info = await this.track(shipment.courierSlug, shipment.number);
        return { ref: shipment.number, info };
    },

    async fetch(shipment) {
        return this.track(shipment.courierSlug, shipment.ref);
    },

    normalise(data) {
        const events = (data?.Checkpoints ?? []).map(c => ({
            id: `${c.Date}|${c.Time}|${c.Activity}`,
            time: parseIst(c.Date, c.Time),
            text: c.Activity ?? "Update",
            location: c.Location || null,
            status: TC_STATUS[c.CheckpointState] ?? null
        }));
        return {
            status: TC_STATUS[data?.ShipmentState] ?? "pending",
            courier: data?.Checkpoints?.[0]?.CourierName ?? null,
            events
        };
    },

    // Free, does not use quota.
    async couriers() {
        const { json } = await request(`${TC_URL}/couriers`, {
            method: "GET",
            headers: { "X-API-Key": process.env.TRACKCOURIER_API_KEY }
        });
        return json?.data?.couriers ?? [];
    }
};

// "18-Sep-2026" + "17:08" (courier local time, IST) -> ISO string
function parseIst(date, time) {
    const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(date ?? "");
    if (!m) return null;
    const month = MONTHS[m[2].toLowerCase()];
    if (!month) return null;
    const hhmm = /^\d{1,2}:\d{2}$/.test(time ?? "") ? time.padStart(5, "0") : "00:00";
    return `${m[3]}-${String(month).padStart(2, "0")}-${m[1].padStart(2, "0")}T${hhmm}:00+05:30`;
}

// ---------------------------------------------------------------- 17TRACK

const T17_URL = "https://api.17track.net/track/v2.2";

const T17_STATUS = {
    NotFound: "pending",
    InfoReceived: "info_received",
    InTransit: "in_transit",
    Expired: "exception",
    AvailableForPickup: "available_for_pickup",
    OutForDelivery: "out_for_delivery",
    DeliveryFailure: "failed_attempt",
    Delivered: "delivered",
    Exception: "exception"
};

// 17TRACK carrier keys for couriers we pin instead of auto-detecting.
const T17_CARRIERS = { fedex: 100003 };

export const track17 = {
    id: "17track",
    name: "17TRACK",

    item(number, shipment) {
        const carrier = T17_CARRIERS[shipment?.courierSlug];
        return carrier ? { number, carrier } : { number };
    },

    enabled() {
        return Boolean(process.env.TRACK17_API_KEY);
    },

    headers() {
        return { "17token": process.env.TRACK17_API_KEY };
    },

    async call(path, body) {
        const { status, json } = await request(`${T17_URL}${path}`, {
            headers: this.headers(),
            body
        });
        if (status < 200 || status >= 300 || json?.code !== 0) {
            const msg = json?.data?.errors?.[0]?.message ?? `HTTP ${status}`;
            throw new ProviderError(`17TRACK ${path}: ${msg}`, {
                quota: /quota/i.test(msg)
            });
        }
        return json.data;
    },

    async quotaRemaining() {
        const data = await this.call("/getquota", undefined);
        return Number(data?.quota_remain ?? 0);
    },

    async register(shipment) {
        const trackingNumber = shipment.number;
        // Check first so we never register past the free trial quota.
        if ((await this.quotaRemaining()) <= 0) {
            throw new ProviderError("17TRACK quota used up", { quota: true });
        }
        const data = await this.call("/register", [this.item(trackingNumber, shipment)]);
        const rejected = data?.rejected?.[0];
        if (rejected && !/already/i.test(rejected.error?.message ?? "")) {
            const msg = rejected.error?.message ?? "rejected";
            throw new ProviderError(`17TRACK: ${msg}`, {
                quota: /quota/i.test(msg),
                invalid: !/quota/i.test(msg)
            });
        }
        // 17TRACK fetches asynchronously; first results arrive on a later poll.
        return {
            ref: trackingNumber,
            info: { status: "pending", courier: null, events: [] }
        };
    },

    async fetch(shipment) {
        const data = await this.call("/gettrackinfo", [this.item(shipment.ref, shipment)]);
        const info = data?.accepted?.[0]?.track_info;
        const provider = info?.tracking?.providers?.[0];
        const events = (provider?.events ?? []).map(e => ({
            id: `${e.time_iso ?? e.time_utc}|${e.description}`,
            time: e.time_iso ?? e.time_utc ?? null,
            text: e.description ?? "Update",
            location: e.location || null,
            status: T17_STATUS[e.stage] ?? null
        }));
        return {
            status: T17_STATUS[info?.latest_status?.status] ?? "pending",
            courier: provider?.provider?.name ?? null,
            events
        };
    }
};

// Order matters: trackcourier.io first, 17TRACK as the fallback.
export const PROVIDERS = [trackcourier, track17];

export function providerById(id) {
    return PROVIDERS.find(p => p.id === id);
}
