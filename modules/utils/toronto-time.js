const TORONTO_TIME_ZONE = "America/Toronto";

const torontoFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TORONTO_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    hourCycle: "h23",
});

function toDate(value) {
    if (value instanceof Date) return new Date(value.getTime());
    return new Date(value || Date.now());
}

export function getTorontoParts(value) {
    const date = toDate(value);
    const parts = torontoFormatter.formatToParts(date);
    const values = {};

    for (const part of parts) {
        if (part.type === "literal") continue;
        values[part.type] = Number(part.value);
    }

    return {
        year: values.year,
        month: values.month,
        day: values.day,
        hour: values.hour,
        minute: values.minute,
        second: values.second,
    };
}

function shiftCalendarDate(parts, dayDelta) {
    const shifted = new Date(
        Date.UTC(parts.year, parts.month - 1, parts.day + dayDelta),
    );

    return {
        year: shifted.getUTCFullYear(),
        month: shifted.getUTCMonth() + 1,
        day: shifted.getUTCDate(),
    };
}

function getUtcInstantForTorontoLocalTime(parts) {
    const desiredUtc = Date.UTC(
        parts.year,
        parts.month - 1,
        parts.day,
        parts.hour || 0,
        parts.minute || 0,
        parts.second || 0,
    );

    let guess = desiredUtc;
    for (let i = 0; i < 3; i += 1) {
        const actual = getTorontoParts(new Date(guess));
        const actualUtc = Date.UTC(
            actual.year,
            actual.month - 1,
            actual.day,
            actual.hour,
            actual.minute,
            actual.second,
        );
        const diff = desiredUtc - actualUtc;
        if (!diff) break;
        guess += diff;
    }

    return new Date(guess);
}

export function applyToronto0001Rule(value) {
    const date = toDate(value);
    const parts = getTorontoParts(date);

    if (parts.hour === 0 && parts.minute < 1) {
        return new Date(date.getTime() - 60 * 1000);
    }

    return date;
}

export function getTorontoDayOfYear(value) {
    const parts = getTorontoParts(value);
    const startOfYearUtc = Date.UTC(parts.year, 0, 1);
    const currentDayUtc = Date.UTC(parts.year, parts.month - 1, parts.day);

    return Math.floor((currentDayUtc - startOfYearUtc) / 86400000) + 1;
}

export function formatTorontoDayKey(value) {
    const parts = getTorontoParts(value);

    return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(
        parts.day,
    ).padStart(2, "0")}`;
}

export function getTorontoDayWindow(value) {
    const parts = getTorontoParts(value);
    const start = getUtcInstantForTorontoLocalTime({
        year: parts.year,
        month: parts.month,
        day: parts.day,
        hour: 0,
        minute: 0,
        second: 0,
    });
    const nextDay = shiftCalendarDate(parts, 1);
    const end = getUtcInstantForTorontoLocalTime({
        year: nextDay.year,
        month: nextDay.month,
        day: nextDay.day,
        hour: 0,
        minute: 0,
        second: 0,
    });

    return { start, end };
}
