const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function coerceDate(value) {
    const date = value instanceof Date ? value : new Date(value || Date.now());
    return Number.isFinite(date.getTime()) ? date : new Date();
}

export function getEffectiveLabelDate(value) {
    return new Date(coerceDate(value));
}

export function getDayOfYear(date) {
    const effective = getEffectiveLabelDate(date);
    const yearStartUtc = Date.UTC(effective.getFullYear(), 0, 1);
    const currentDayUtc = Date.UTC(
        effective.getFullYear(),
        effective.getMonth(),
        effective.getDate(),
    );
    return Math.floor((currentDayUtc - yearStartUtc) / ONE_DAY_MS) + 1;
}

export function formatLocalDayKey(date) {
    const effective = getEffectiveLabelDate(date);
    const year = effective.getFullYear();
    const month = String(effective.getMonth() + 1).padStart(2, "0");
    const day = String(effective.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

export function getLabelDayContext(date) {
    const effective = getEffectiveLabelDate(date);
    const start = new Date(effective);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const dayOfYear = getDayOfYear(effective);
    return {
        effective,
        start,
        end,
        dayOfYear,
        dayOfYearStr: String(dayOfYear).padStart(3, "0"),
        yearDigit: String(effective.getFullYear()).slice(-1),
        localDayKey: formatLocalDayKey(start),
    };
}
