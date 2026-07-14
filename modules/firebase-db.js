// Lightweight Firebase Realtime Database helper for browser usage
// Uses Firebase v9+ CDN ESM modules to avoid bundler setup

// IMPORTANT: Ensure your Realtime Database exists for the project and its URL:
//   https://nylene-label-printer-default-rtdb.firebaseio.com

import {
    initializeApp,
    getApps,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
    getDatabase,
    ref,
    push,
    serverTimestamp,
    get,
    set,
    onValue,
    runTransaction,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import {
    LABEL_SEQUENCE_MAX,
    getNextPrSequenceFromRecords,
    getNextCoperionSequenceFromRecords,
    getNextCompoundBagsSequenceFromRecords,
    getLastPrSequenceFromRecords,
    getLastCoperionSequenceFromRecords,
    getLastCompoundBagsSequenceFromRecords,
    claimFromSequenceState,
    releaseToSequenceState,
} from "./utils/daily-sequence.js";
import {
    formatLocalDayKey,
    getDayOfYear,
    getLabelDayContext,
} from "./utils/label-rollover.js";

// const firebaseConfig = {
//     apiKey: "AIzaSyAcNqa-rlwixUAsS7hTGsXaqiC8ELMVJXw",
//     authDomain: "nylene-label-printer.firebaseapp.com",
//     databaseURL: "https://nylene-label-printer-default-rtdb.firebaseio.com",
//     projectId: "nylene-label-printer",
//     storageBucket: "nylene-label-printer.firebasestorage.app",
//     messagingSenderId: "906222982085",
//     appId: "1:906222982085:web:5c9808ced0307256c0b1ac",
// };

const firebaseConfig = {
    apiKey: "AIzaSyDy_2NzV6xyPMG5y-dFuzbMIWK9hAr1Lmo",
    authDomain: "nylene-lps.firebaseapp.com",
    databaseURL: "https://nylene-lps-default-rtdb.firebaseio.com",
    projectId: "nylene-lps",
    storageBucket: "nylene-lps.firebasestorage.app",
    messagingSenderId: "624720595566",
    appId: "1:624720595566:web:aaacaacab430485ff3747f",
    measurementId: "G-T0HNVBN16F",
};

export function getAppInstance() {
    const apps = getApps();
    if (apps.length) return apps[0];
    return initializeApp(firebaseConfig);
}

function getDatabaseInstance() {
    const app = getAppInstance();
    return getDatabase(app);
}

function sanitizeProductSelectionPathSegment(value) {
    return String(value || "")
        .trim()
        .replace(/[.#$[\]/]/g, "_");
}

function makeProductSelectionPath(context) {
    if (!context || !context.flow || !context.sourceGroup || !context.sourceLetter) {
        return null;
    }
    const flow = sanitizeProductSelectionPathSegment(context.flow);
    const group = sanitizeProductSelectionPathSegment(context.sourceGroup);
    const letter = sanitizeProductSelectionPathSegment(context.sourceLetter);
    return `productSelections/${flow}/${group}/${letter}`;
}

export async function saveProductSelectionToFirebase(context, selection) {
    const path = makeProductSelectionPath(context);
    if (!path) return false;
    try {
        const db = getDatabaseInstance();
        await set(ref(db, path), {
            ...(selection || {}),
            _updatedAt: serverTimestamp(),
        });
        return true;
    } catch (err) {
        console.warn("Firebase product selection save failed", err);
        return false;
    }
}

export async function fetchProductSelectionFromFirebase(context) {
    const path = makeProductSelectionPath(context);
    if (!path) return null;
    try {
        const db = getDatabaseInstance();
        const snap = await get(ref(db, path));
        return snap.exists() ? snap.val() : null;
    } catch (err) {
        console.warn("Firebase product selection fetch failed", err);
        return null;
    }
}

export function subscribeToProductSelection(context, onChange, onError) {
    const path = makeProductSelectionPath(context);
    if (!path) return () => {};
    const db = getDatabaseInstance();
    const selectionRef = ref(db, path);
    return onValue(
        selectionRef,
        (snap) => {
            onChange(snap.exists() ? snap.val() : null);
        },
        (error) => {
            console.warn("Firebase product selection subscription failed", error);
            if (typeof onError === "function") onError(error);
        },
    );
}

export async function savePrintToFirebase(record) {
    try {
        const db = getDatabaseInstance();

        // Use LOCAL day key (YYYY-MM-DD) so Firebase buckets match the operator's "today".
        // Note: timestamp remains ISO/UTC; only the bucket key is localized.
        const iso =
            record && record.timestamp
                ? record.timestamp
                : new Date().toISOString();
        const when = parseIsoDateOrNow(iso);
        const { localDayKey: day } = getLabelDayContext(when); // YYYY-MM-DD (local)
        const printsRef = ref(db, `prints/${day}`);

        const payload = {
            ...record,
            _createdAt: serverTimestamp(),
        };

        await push(printsRef, payload);
        return true;
    } catch (err) {
        console.warn("Firebase save failed", err);
        return false;
    }
}

// Fetch all print logs from Realtime Database and return as a flat array
// Sorted by timestamp ascending. Each item mirrors the schema saved by
// savePrintToFirebase.
export async function fetchAllPrintsFromFirebase() {
    const db = getDatabaseInstance();
    const rootRef = ref(db, "prints");
    const snap = await get(rootRef);
    const rows = [];
    if (snap.exists()) {
        snap.forEach((daySnap) => {
            const dayKey = daySnap.key || ""; // YYYY-MM-DD
            daySnap.forEach((printSnap) => {
                const d = printSnap.val() || {};
                rows.push({
                    id: printSnap.key,
                    day: dayKey,
                    ...d,
                });
            });
        });
    }
    rows.sort((a, b) =>
        String(a.timestamp || "").localeCompare(String(b.timestamp || "")),
    );
    return rows;
}

async function fetchPrintRecordsForLabelDay(db, dayContext) {
    const { start, end, localDayKey } = dayContext;
    // Determine which buckets to read:
    // - local day key (new writes)
    // - UTC day keys spanning this local day (legacy writes / timezone edge)
    const dayKeys = new Set();
    const startUtcKey = start.toISOString().slice(0, 10);
    const endUtcKey = new Date(end.getTime() - 1).toISOString().slice(0, 10);
    dayKeys.add(localDayKey);
    dayKeys.add(startUtcKey);
    dayKeys.add(endUtcKey);

    const refs = Array.from(dayKeys).map((k) => ref(db, `prints/${k}`));
    const snaps = await Promise.all(refs.map((r) => get(r)));
    return collectRecordsWithinWindow(snaps, start, end);
}

// Counter stores last claimed suffix + free list for a pool on a local day.
// Path: labelSequences/{YYYY-MM-DD}/{pr|coperion|compoundBags}
// Shape: { last: number, free: { "24": true, ... } }
// Legacy plain-number counters are migrated on first transaction.
function makeSequenceCounterPath(localDayKey, sequenceName) {
    return `labelSequences/${localDayKey}/${sequenceName}`;
}

/**
 * Atomically claim the next suffix for a pool.
 * Prefers freed (cancelled) suffixes, otherwise advances last.
 * Seeded from printed history so we never reuse a printed number.
 */
async function claimSequenceTransaction(localDayKey, sequenceName, seedLast) {
    const db = getDatabaseInstance();
    const counterRef = ref(
        db,
        makeSequenceCounterPath(localDayKey, sequenceName),
    );
    let claimed = null;
    const result = await runTransaction(counterRef, (currentValue) => {
        const step = claimFromSequenceState(currentValue, seedLast, {
            maxAt: LABEL_SEQUENCE_MAX,
        });
        if (!step.ok) {
            claimed = null;
            return undefined;
        }
        claimed = step.claimed;
        return step.nextState;
    });

    if (!result.committed || !Number.isFinite(claimed)) {
        throw new Error(
            `No ${sequenceName} label numbers remain for ${localDayKey}`,
        );
    }
    return claimed;
}

/**
 * Return a cancelled claim so the suffix can be reused (no skip).
 */
async function releaseSequenceTransaction(
    localDayKey,
    sequenceName,
    suffix,
    seedLast,
) {
    const db = getDatabaseInstance();
    const counterRef = ref(
        db,
        makeSequenceCounterPath(localDayKey, sequenceName),
    );
    const released = Number(suffix);
    if (!Number.isFinite(released)) {
        throw new Error(`Invalid sequence suffix to release: ${suffix}`);
    }

    const result = await runTransaction(counterRef, (currentValue) =>
        releaseToSequenceState(currentValue, released, seedLast),
    );

    if (!result.committed) {
        throw new Error(
            `Could not release ${sequenceName} sequence ${released} for ${localDayKey}`,
        );
    }
    return released;
}

// Compute the next daily sequence (last three digits) for a given date
// by inspecting existing prints for that day in Realtime Database.
// Buckets were historically stored under UTC day keys; we now store under local
// day keys. For backward compatibility, we read both local and UTC buckets.
// Returns 1 if no prior regular (non-RI) P&R prints exist for the day.
// Preview-only: does not claim/advance the shared counter.
export async function getNextDailySequenceFromFirebase(date) {
    const db = getDatabaseInstance();
    const dayContext = getLabelDayContext(date);
    const { dayOfYearStr, yearDigits } = dayContext;

    // Build the Coperion EA day prefix so P&R excludes same-day Coperion labels,
    // including legacy labels whose year digits were generated differently.
    const coperionPrefixForDay = `EA${yearDigits}${dayOfYearStr}`;
    const records = await fetchPrintRecordsForLabelDay(db, dayContext);
    return getNextPrSequenceFromRecords(records, { coperionPrefixForDay });
}

// Claim the next P&R suffix atomically at print time (not preview).
export async function claimNextDailySequenceFromFirebase(date) {
    const db = getDatabaseInstance();
    const dayContext = getLabelDayContext(date);
    const { dayOfYearStr, yearDigits, localDayKey } = dayContext;
    const coperionPrefixForDay = `EA${yearDigits}${dayOfYearStr}`;
    const records = await fetchPrintRecordsForLabelDay(db, dayContext);
    const seedLast = getLastPrSequenceFromRecords(records, {
        coperionPrefixForDay,
    });
    return claimSequenceTransaction(localDayKey, "pr", seedLast);
}

export async function releaseDailySequenceToFirebase(date, suffix) {
    const db = getDatabaseInstance();
    const dayContext = getLabelDayContext(date);
    const { dayOfYearStr, yearDigits, localDayKey } = dayContext;
    const coperionPrefixForDay = `EA${yearDigits}${dayOfYearStr}`;
    const records = await fetchPrintRecordsForLabelDay(db, dayContext);
    const seedLast = getLastPrSequenceFromRecords(records, {
        coperionPrefixForDay,
    });
    return releaseSequenceTransaction(localDayKey, "pr", suffix, seedLast);
}

// Compute the next Coperion daily sequence (last three digits) for the given date
// Rules:
// - Prefix for Coperion: EA + last two digits of year + day-of-year (DDD)
// - Last three digits start at 401 each new day (00:01 rule applies)
// - Increments based on existing regular (non-RI) records in DB for the same EA day prefix,
//   ignoring the year digits so migrated labels continue from legacy EA16DDD suffixes
// - Returns the next suffix within 401..999
// Preview-only: does not claim/advance the shared counter.
export async function getNextCoperionSequenceFromFirebase(date) {
    const db = getDatabaseInstance();
    const dayContext = getLabelDayContext(date);
    const { dayOfYearStr, yearDigits } = dayContext;

    // Build the EA prefix for the day: EA[YY][DDD]
    const prefix = `EA${yearDigits}${dayOfYearStr}`;
    const records = await fetchPrintRecordsForLabelDay(db, dayContext);
    return getNextCoperionSequenceFromRecords(records, { prefix });
}

export async function claimNextCoperionSequenceFromFirebase(date) {
    const db = getDatabaseInstance();
    const dayContext = getLabelDayContext(date);
    const { dayOfYearStr, yearDigits, localDayKey } = dayContext;
    const prefix = `EA${yearDigits}${dayOfYearStr}`;
    const records = await fetchPrintRecordsForLabelDay(db, dayContext);
    const seedLast = getLastCoperionSequenceFromRecords(records, { prefix });
    return claimSequenceTransaction(localDayKey, "coperion", seedLast);
}

export async function releaseCoperionSequenceToFirebase(date, suffix) {
    const db = getDatabaseInstance();
    const dayContext = getLabelDayContext(date);
    const { dayOfYearStr, yearDigits, localDayKey } = dayContext;
    const prefix = `EA${yearDigits}${dayOfYearStr}`;
    const records = await fetchPrintRecordsForLabelDay(db, dayContext);
    const seedLast = getLastCoperionSequenceFromRecords(records, { prefix });
    return releaseSequenceTransaction(
        localDayKey,
        "coperion",
        suffix,
        seedLast,
    );
}

// Compute the next Compound+BAGS daily sequence (last three digits) for the given date.
// Rules:
// - Applies only to prints where sourceGroup === "compound" AND product ends with "BAGS"
// - Last three digits start at 201 each new day (00:01 rule applies)
// - Increments based on existing regular (non-RI) matching records in DB
// - Returns the next suffix within 201..999
// Preview-only: does not claim/advance the shared counter.
export async function getNextCompoundBagsSequenceFromFirebase(date) {
    const db = getDatabaseInstance();
    const dayContext = getLabelDayContext(date);
    const records = await fetchPrintRecordsForLabelDay(db, dayContext);
    return getNextCompoundBagsSequenceFromRecords(records);
}

export async function claimNextCompoundBagsSequenceFromFirebase(date) {
    const db = getDatabaseInstance();
    const dayContext = getLabelDayContext(date);
    const records = await fetchPrintRecordsForLabelDay(db, dayContext);
    const seedLast = getLastCompoundBagsSequenceFromRecords(records);
    return claimSequenceTransaction(
        dayContext.localDayKey,
        "compoundBags",
        seedLast,
    );
}

export async function releaseCompoundBagsSequenceToFirebase(date, suffix) {
    const db = getDatabaseInstance();
    const dayContext = getLabelDayContext(date);
    const records = await fetchPrintRecordsForLabelDay(db, dayContext);
    const seedLast = getLastCompoundBagsSequenceFromRecords(records);
    return releaseSequenceTransaction(
        dayContext.localDayKey,
        "compoundBags",
        suffix,
        seedLast,
    );
}

function parseIsoDateOrNow(value) {
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d : new Date();
}

function collectRecordsWithinWindow(snaps, start, end) {
    const records = [];
    const startMs = start.getTime();
    const endMs = end.getTime();
    for (const snap of snaps) {
        if (!snap.exists()) continue;
        snap.forEach((child) => {
            const val = child.val() || {};
            const ts = val.timestamp;
            if (!ts) return;
            const time = new Date(ts).getTime();
            if (!(time >= startMs && time < endMs)) return;
            records.push(val);
        });
    }
    return records;
}
