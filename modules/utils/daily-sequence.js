function normalizeUnitNumber(value) {
    return String(value || "").trim().toUpperCase();
}

export function isReissueRecord(record) {
    return String(record?.reissueFlag || "")
        .trim()
        .toUpperCase() === "RI";
}

function isCompoundBagsRecord(record) {
    const sourceGroup = String(record?.sourceGroup || "").trim().toLowerCase();
    if (sourceGroup !== "compound") return false;
    const product = String(record?.product || "").trim().toLowerCase();
    return product.endsWith("bags");
}

function matchesDayPrefixIgnoringYear(unitNumber, dayPrefix) {
    const unit = normalizeUnitNumber(unitNumber);
    const prefix = normalizeUnitNumber(dayPrefix);
    if (!prefix) return false;
    if (unit.startsWith(prefix)) return true;
    if (unit.length < 7 || prefix.length < 7) return false;
    return (
        unit.slice(0, 2) === prefix.slice(0, 2) &&
        unit.slice(4, 7) === prefix.slice(4, 7)
    );
}

function isCoperionRecord(record, coperionPrefixForDay) {
    const productLine = String(record?.productLine || "").trim();
    const unit = normalizeUnitNumber(record?.unitNumber);
    return (
        productLine === "Coperion" ||
        matchesDayPrefixIgnoringYear(unit, coperionPrefixForDay)
    );
}

export const LABEL_SEQUENCE_MAX = 999;

/**
 * Pure counter step used by Firebase transactions.
 * `seedLast` is the highest already-issued suffix from print history
 * (or startAt - 1 when none exist). Returns null when exhausted.
 */
export function nextClaimedSequence(
    currentValue,
    seedLast,
    { maxAt = LABEL_SEQUENCE_MAX } = {},
) {
    const seed = Number.isFinite(Number(seedLast)) ? Number(seedLast) : 0;
    const current = Number(currentValue);
    const currentLast = Number.isFinite(current) ? current : seed;
    const baseLast = Math.max(seed, currentLast);
    if (baseLast >= maxAt) return null;
    return baseLast + 1;
}

function cloneFreeMap(free) {
    if (!free || typeof free !== "object") return {};
    const out = {};
    for (const [key, value] of Object.entries(free)) {
        if (value == null || value === false) continue;
        const num = Number(key);
        if (!Number.isFinite(num)) continue;
        out[String(Math.floor(num))] = true;
    }
    return out;
}

/**
 * Normalize legacy numeric counters and object counters into
 * `{ last, free }` where `free` maps reusable suffixes -> true.
 */
export function normalizeSequenceState(currentValue, seedLast) {
    const seed = Number.isFinite(Number(seedLast)) ? Number(seedLast) : 0;
    if (currentValue == null) {
        return { last: seed, free: {} };
    }
    if (typeof currentValue === "number" || typeof currentValue === "string") {
        const last = Number(currentValue);
        return {
            last: Number.isFinite(last) ? last : seed,
            free: {},
        };
    }
    if (typeof currentValue === "object") {
        const last = Number(currentValue.last);
        return {
            last: Number.isFinite(last) ? last : seed,
            free: cloneFreeMap(currentValue.free),
        };
    }
    return { last: seed, free: {} };
}

function lowestFreeSuffix(free) {
    const nums = Object.keys(free || {})
        .map((key) => Number(key))
        .filter((n) => Number.isFinite(n))
        .sort((a, b) => a - b);
    return nums.length ? nums[0] : null;
}

/**
 * Claim the next suffix from counter state.
 * Prefers the lowest freed (cancelled) suffix, otherwise advances `last`.
 * Returns `{ ok, claimed, nextState }` or `{ ok: false }`.
 */
export function claimFromSequenceState(
    currentValue,
    seedLast,
    { maxAt = LABEL_SEQUENCE_MAX } = {},
) {
    const state = normalizeSequenceState(currentValue, seedLast);
    const free = { ...state.free };
    const fromFree = lowestFreeSuffix(free);
    if (fromFree !== null) {
        delete free[String(fromFree)];
        return {
            ok: true,
            claimed: fromFree,
            nextState: {
                last: Math.max(state.last, fromFree),
                free,
            },
        };
    }

    const next = nextClaimedSequence(state.last, seedLast, { maxAt });
    if (next === null) return { ok: false };
    return {
        ok: true,
        claimed: next,
        nextState: {
            last: next,
            free,
        },
    };
}

/**
 * Return a cancelled claim to the free list (or shrink `last` when it is
 * still the high-water mark) so the suffix can be reused without a skip.
 */
export function releaseToSequenceState(currentValue, suffix, seedLast) {
    const state = normalizeSequenceState(currentValue, seedLast);
    const released = Number(suffix);
    if (!Number.isFinite(released)) {
        return { last: state.last, free: { ...state.free } };
    }

    const free = { ...state.free, [String(released)]: true };
    let last = state.last;

    // If we released the current high-water mark, shrink last so the next
    // advance reuses it directly instead of leaving a free-list entry.
    while (free[String(last)]) {
        delete free[String(last)];
        last -= 1;
    }

    return { last, free };
}

export function getNextSequenceFromRecords(
    records,
    { startAt = 1, includeRecord = () => true } = {},
) {
    const last = getLastSequenceFromRecords(records, {
        startAt,
        includeRecord,
    });
    return Math.min(LABEL_SEQUENCE_MAX, Math.max(startAt, last + 1));
}

export function getLastSequenceFromRecords(
    records,
    { startAt = 1, includeRecord = () => true } = {},
) {
    const rows = Array.isArray(records) ? records : [];
    let maxSuffix = 0;
    let anyParseable = false;
    let count = 0;

    for (const record of rows) {
        if (!includeRecord(record)) continue;
        count += 1;
        const suffix = parseInt(
            normalizeUnitNumber(record?.unitNumber).slice(-3),
            10,
        );
        if (Number.isFinite(suffix)) {
            anyParseable = true;
            if (suffix > maxSuffix) maxSuffix = suffix;
        }
    }

    if (anyParseable) return Math.max(startAt - 1, maxSuffix);
    if (count > 0) return startAt + count - 1;
    return startAt - 1;
}

function isPrPoolRecord(record, coperionPrefixForDay) {
    return (
        !isReissueRecord(record) &&
        !isCoperionRecord(record, coperionPrefixForDay) &&
        !isCompoundBagsRecord(record)
    );
}

export function getNextPrSequenceFromRecords(
    records,
    { coperionPrefixForDay = "" } = {},
) {
    return getNextSequenceFromRecords(records, {
        startAt: 1,
        includeRecord: (record) => isPrPoolRecord(record, coperionPrefixForDay),
    });
}

export function getLastPrSequenceFromRecords(
    records,
    { coperionPrefixForDay = "" } = {},
) {
    return getLastSequenceFromRecords(records, {
        startAt: 1,
        includeRecord: (record) => isPrPoolRecord(record, coperionPrefixForDay),
    });
}

export function getNextCoperionSequenceFromRecords(
    records,
    { prefix = "" } = {},
) {
    const normalizedPrefix = normalizeUnitNumber(prefix);
    return getNextSequenceFromRecords(records, {
        startAt: 401,
        includeRecord: (record) =>
            !isReissueRecord(record) &&
            normalizedPrefix &&
            matchesDayPrefixIgnoringYear(record?.unitNumber, normalizedPrefix),
    });
}

export function getLastCoperionSequenceFromRecords(
    records,
    { prefix = "" } = {},
) {
    const normalizedPrefix = normalizeUnitNumber(prefix);
    return getLastSequenceFromRecords(records, {
        startAt: 401,
        includeRecord: (record) =>
            !isReissueRecord(record) &&
            normalizedPrefix &&
            matchesDayPrefixIgnoringYear(record?.unitNumber, normalizedPrefix),
    });
}

export function getNextCompoundBagsSequenceFromRecords(records) {
    return getNextSequenceFromRecords(records, {
        startAt: 201,
        includeRecord: (record) =>
            !isReissueRecord(record) && isCompoundBagsRecord(record),
    });
}

export function getLastCompoundBagsSequenceFromRecords(records) {
    return getLastSequenceFromRecords(records, {
        startAt: 201,
        includeRecord: (record) =>
            !isReissueRecord(record) && isCompoundBagsRecord(record),
    });
}
