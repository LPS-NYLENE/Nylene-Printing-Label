function normalizeUnitNumber(value) {
    return String(value || "").trim().toUpperCase();
}

export const PR_SEQUENCE_START = 1;
export const PR_SEQUENCE_MAX = 200;
export const BAGS_SEQUENCE_START = 201;
export const LABEL_SEQUENCE_MAX = 999;

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
    return unit.slice(0, 2) === prefix.slice(0, 2) &&
        unit.slice(4, 7) === prefix.slice(4, 7);
}

function isCoperionRecord(record, coperionPrefixForDay) {
    const productLine = String(record?.productLine || "").trim();
    const unit = normalizeUnitNumber(record?.unitNumber);
    return (
        productLine === "Coperion" ||
              matchesDayPrefixIgnoringYear(unit, coperionPrefixForDay)

    );
}

export function getNextSequenceFromRecords(
    records,
    {
        startAt = PR_SEQUENCE_START,
        maxAt = LABEL_SEQUENCE_MAX,
        includeRecord = () => true,
    } = {},
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

    const next = anyParseable
        ? Math.max(startAt, maxSuffix + 1)
        : startAt + count;
    return next <= maxAt ? next : null;
}

export function getNextPrSequenceFromRecords(
    records,
    { coperionPrefixForDay = "" } = {},
) {
    return getNextSequenceFromRecords(records, {
        startAt: PR_SEQUENCE_START,
        maxAt: PR_SEQUENCE_MAX,
        includeRecord: (record) =>
            !isReissueRecord(record) &&
            !isCoperionRecord(record, coperionPrefixForDay) &&
            !isCompoundBagsRecord(record),
    });
}

export function getNextCoperionSequenceFromRecords(
    records,
    { prefix = "" } = {},
) {
    const normalizedPrefix = normalizeUnitNumber(prefix);
    return getNextSequenceFromRecords(records, {
        startAt: 401,
        maxAt: LABEL_SEQUENCE_MAX,
        includeRecord: (record) =>
            !isReissueRecord(record) &&
            normalizedPrefix &&
             matchesDayPrefixIgnoringYear(record?.unitNumber, normalizedPrefix),
    });
}

export function getNextCompoundBagsSequenceFromRecords(records) {
    return getNextSequenceFromRecords(records, {
        startAt: BAGS_SEQUENCE_START,
        maxAt: LABEL_SEQUENCE_MAX,
        includeRecord: (record) =>
            !isReissueRecord(record) && isCompoundBagsRecord(record),
    });
}
