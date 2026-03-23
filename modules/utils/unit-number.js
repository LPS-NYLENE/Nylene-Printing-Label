function normalizeDigits(value) {
    return String(value ?? "").replace(/[^\d]/g, "");
}

export function normalizeUnitNumber(value) {
    return String(value || "").trim().toUpperCase();
}

const PREFIX_TO_SOURCE = {
    // Dryer
    AD: { group: "dryer", letter: "A" },
    BD: { group: "dryer", letter: "B" },
    CD: { group: "dryer", letter: "C" },
    DE: { group: "dryer", letter: "D" },
    // Silo / Bulk
    AS: { group: "silo", letter: "A" },
    BS: { group: "silo", letter: "B" },
    CS: { group: "silo", letter: "C" },
    DS: { group: "silo", letter: "D" },
    // Compound
    AC: { group: "compound", letter: "A" },
    BC: { group: "compound", letter: "B" },
    // Special
    UX: { group: "other", letter: "UX" },
    LT: { group: "other", letter: "LT" },
};

export function parseSourceFromPrefix(prefix) {
    const key = normalizeUnitNumber(prefix).slice(0, 2);
    return PREFIX_TO_SOURCE[key] || null;
}

export function buildUnitNumberFromParts({ prefix, year, day, box }) {
    const src = normalizeUnitNumber(prefix).slice(0, 2);
    if (!parseSourceFromPrefix(src)) {
        return { ok: false, error: "Select a valid source prefix." };
    }

    const yDigits = normalizeDigits(year);
    const yearDigit = yDigits ? yDigits.slice(-1) : "";
    if (!yearDigit) return { ok: false, error: "Enter a year." };

    const dDigits = normalizeDigits(day);
    const dNum = parseInt(dDigits, 10);
    if (!Number.isFinite(dNum) || dNum < 1 || dNum > 366) {
        return { ok: false, error: "Enter a valid day of year (1–366)." };
    }
    const dayStr = String(dNum).padStart(3, "0");

    const bDigits = normalizeDigits(box);
    const bNum = parseInt(bDigits, 10);
    if (!Number.isFinite(bNum) || bNum < 0 || bNum > 999) {
        return { ok: false, error: "Enter a valid box # (000–999)." };
    }
    const boxStr = String(bNum).padStart(3, "0");

    // Format: PREFIX + "1" + yearDigit + DDD + SSS
    return { ok: true, unitNumber: `${src}1${yearDigit}${dayStr}${boxStr}` };
}

