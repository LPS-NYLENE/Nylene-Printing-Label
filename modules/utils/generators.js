import { getNextDailySequenceFromFirebase, getNextCoperionSequenceFromFirebase } from "../firebase-db.js";

export function generateUnitNumber(sourceGroup, sourceLetter) {
    const now = new Date();
    const effective = apply1201Rule(now);
    const doy = getDayOfYear(effective);
    const doyStr = String(doy).padStart(3, "0");
    const seq = getNextDailySequence(effective);
    const seqStr = String(seq).padStart(3, "0");
    const prefix = resolvePrefix(sourceGroup, sourceLetter);
    const yearDigit = String(effective.getFullYear()).slice(-1);
    return `${prefix}1${yearDigit}${doyStr}${seqStr}`;
}

// Async variant: compute the next unit number by reading existing prints
// for today from Firebase Realtime Database instead of localStorage.
// Resets to 001 at the start of a new UTC day (consistent with saved logs).
export async function generateUnitNumberFromFirebase(sourceGroup, sourceLetter) {
    const now = new Date();
    const effective = apply1201Rule(now);
    const doy = getDayOfYear(effective);
    const doyStr = String(doy).padStart(3, "0");
    const yearDigit = String(effective.getFullYear()).slice(-1);

    const seq = await getNextDailySequenceFromFirebase(now);
    const seqStr = String(seq).padStart(3, "0");
    const prefix = resolvePrefix(sourceGroup, sourceLetter);
    return `${prefix}1${yearDigit}${doyStr}${seqStr}`;
}

// Explicit Coperion generator, to be used only for Coperion flow/screens.
// Format: EA + 1 + last digit of year + day-of-year (001–365/366) + suffix starting at 401
export async function generateCoperionUnitNumberFromFirebase() {
    const now = new Date();
    const effective = apply1201Rule(now);
    const doy = getDayOfYear(effective);
    const doyStr = String(doy).padStart(3, "0");
    const yearDigit = String(effective.getFullYear()).slice(-1);
    const seq = await getNextCoperionSequenceFromFirebase(now);
    const seqStr = String(seq).padStart(3, "0");
    return `EA1${yearDigit}${doyStr}${seqStr}`;
}

function getDayOfYear(date) {
    const start = new Date(date.getFullYear(), 0, 1);
    const diffMs = date - start;
    const oneDayMs = 24 * 60 * 60 * 1000;
    return Math.floor(diffMs / oneDayMs) + 1;
}

const SEQ_STORE_KEY = "unit_seq_store_v1";
function getNextDailySequence(date) {
    try {
        const y = date.getFullYear();
        const doy = getDayOfYear(date);
        const key = `${y}-${doy}`;
        const raw = localStorage.getItem(SEQ_STORE_KEY);
        const store = raw ? JSON.parse(raw) : {};
        const current = store[key] || 0;
        return current + 1;
    } catch {
        if (!window.__fallbackSeq) window.__fallbackSeq = 0;
        return window.__fallbackSeq + 1;
    }
}
function getAndIncrementDailySequence(date) {
    try {
        const y = date.getFullYear();
        const doy = getDayOfYear(date);
        const key = `${y}-${doy}`;
        const raw = localStorage.getItem(SEQ_STORE_KEY);
        const store = raw ? JSON.parse(raw) : {};
        const current = store[key] || 0;
        const next = current + 1;
        store[key] = next;
        const entries = Object.entries(store)
            .sort((a, b) => (a[0] < b[0] ? -1 : 1))
            .slice(-370);
        const trimmed = Object.fromEntries(entries);
        localStorage.setItem(SEQ_STORE_KEY, JSON.stringify(trimmed));
        return next;
    } catch {
        if (!window.__fallbackSeq) window.__fallbackSeq = 0;
        window.__fallbackSeq += 1;
        return window.__fallbackSeq;
    }
}

// For times between 00:00 and 00:01 inclusive, treat as previous day
function apply1201Rule(date) {
    const d = new Date(date);
    const minutesSinceMidnight = d.getHours() * 60 + d.getMinutes();
    if (minutesSinceMidnight < 1) {
        // subtract one minute to go to previous day window
        d.setMinutes(d.getMinutes() - 1);
    }
    return d;
}

// Commit the currently displayed unit number by incrementing the stored daily sequence.
// Returns the committed unit number string that was just reserved/printed.
export function commitPrintedUnitNumber(sourceGroup, sourceLetter) {
    const now = new Date();
    const effective = apply1201Rule(now);
    const doy = getDayOfYear(effective);
    const doyStr = String(doy).padStart(3, "0");
    const seq = getAndIncrementDailySequence(effective);
    const seqStr = String(seq).padStart(3, "0");
    const prefix = resolvePrefix(sourceGroup, sourceLetter);
    const yearDigit = String(effective.getFullYear()).slice(-1);
    return `${prefix}1${yearDigit}${doyStr}${seqStr}`;
}

export function generateBigCode() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let out = "";
    for (let i = 0; i < 7; i++)
        out += alphabet[Math.floor(Math.random() * alphabet.length)];
    return out;
}

// Prefix resolution based on selected source
// - Dryer: A->AD, B->BD, C->CD, D->DE
// - Silo/Bulk: A->AS, B->BS, C->CS, D->DS
// - Compound: A->AC, B->BC
// Fallback to 'AC' if missing/unknown
function resolvePrefix(sourceGroup, sourceLetter) {
    const group = String(sourceGroup || "").toLowerCase();
    const letter = String(sourceLetter || "").toUpperCase();
    if (!group || !letter) return "AC";
    if (group === "dryer") {
        if (letter === "A") return "AD";
        if (letter === "B") return "BD";
        if (letter === "C") return "CD";
        if (letter === "D") return "DE";
    } else if (group === "silo" || group === "bulk") {
        if (letter === "A") return "AS";
        if (letter === "B") return "BS";
        if (letter === "C") return "CS";
        if (letter === "D") return "DS";
    } else if (group === "compound") {
        if (letter === "A") return "AC";
        if (letter === "B") return "BC";
    } else if (group === "other" || group === "special") {
        if (letter === "UX") return "UX";
        if (letter === "LT") return "LT";
    }
    return "AC";
}
