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

function unitNumberMatchesLabelDay(unitNumber, labelDayDigits) {
    const unit = normalizeUnitNumber(unitNumber);
    const dayDigits = normalizeUnitNumber(labelDayDigits);
    // Unit format: [source 2][YY 2][DDD 3][suffix 3]
    if (!dayDigits || unit.length < 10 || dayDigits.length !== 5) return false;
    return unit.slice(2, 7) === dayDigits;
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

function isPrPoolRecord(record, coperionPrefixForDay, labelDayDigits) {
    if (isCoperionRecord(record, coperionPrefixForDay)) return false;
    if (isCompoundBagsRecord(record)) return false;
    // Same-day reissues still occupy a suffix (e.g. BS26196020 RI must
    // block AC26196020). Other-day reissues of old boxes do not.
    if (isReissueRecord(record)) {
        return unitNumberMatchesLabelDay(record?.unitNumber, labelDayDigits);
    }
    return true;
}

export function getNextPrSequenceFromRecords(
    records,
    { coperionPrefixForDay = "", labelDayDigits = "" } = {},
) {
    const dayDigits =
        labelDayDigits ||
        normalizeUnitNumber(coperionPrefixForDay).slice(2, 7);
    return getNextSequenceFromRecords(records, {
        startAt: 1,
        includeRecord: (record) =>
            isPrPoolRecord(record, coperionPrefixForDay, dayDigits),
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
            Boolean(normalizedPrefix) &&
            matchesDayPrefixIgnoringYear(record?.unitNumber, normalizedPrefix),
    });
}

export function getNextCompoundBagsSequenceFromRecords(
    records,
    { labelDayDigits = "" } = {},
) {
    return getNextSequenceFromRecords(records, {
        startAt: 201,
        includeRecord: (record) => {
            if (!isCompoundBagsRecord(record)) return false;
            if (!isReissueRecord(record)) return true;
            return unitNumberMatchesLabelDay(
                record?.unitNumber,
                labelDayDigits,
            );
        },
    });
}
