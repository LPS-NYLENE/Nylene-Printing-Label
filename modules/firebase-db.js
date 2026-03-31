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
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import {
    getNextPrSequenceFromRecords,
    getNextCoperionSequenceFromRecords,
    getNextCompoundBagsSequenceFromRecords,
} from "./utils/daily-sequence.js";

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
        const effective = apply0001Rule(when);
        const day = formatLocalDayKey(effective); // YYYY-MM-DD (local)
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

// Compute the next daily sequence (last three digits) for a given date
// by inspecting existing prints for that day in Realtime Database.
// Buckets were historically stored under UTC day keys; we now store under local
// day keys. For backward compatibility, we read both local and UTC buckets.
// Returns 1 if no prior regular (non-RI) P&R prints exist for the day.
export async function getNextDailySequenceFromFirebase(date) {
    const db = getDatabaseInstance();
    const input = date instanceof Date ? date : new Date(date || Date.now());
    // Apply the app's 00:01 rule: 00:00-00:01 belongs to previous day
    const effective = new Date(input);
    const minutesSinceMidnight =
        effective.getHours() * 60 + effective.getMinutes();
    if (minutesSinceMidnight < 1) {
        effective.setMinutes(effective.getMinutes() - 1);
    }
    // Local day boundaries
    const start = new Date(effective);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    // Build the Coperion EA prefix for this day so we can exclude it from P&R sequence
    const yearDigit = String(effective.getFullYear()).slice(-1);
    const doyStr = String(getDayOfYear(effective)).padStart(3, "0");
    const coperionPrefixForDay = `EA1${yearDigit}${doyStr}`;

    // Determine which buckets to read:
    // - local day key (new writes)
    // - UTC day keys spanning this local day (legacy writes / timezone edge)
    const dayKeys = new Set();
    const localKey = formatLocalDayKey(start);
    const startUtcKey = start.toISOString().slice(0, 10);
    const endUtcKey = new Date(end.getTime() - 1).toISOString().slice(0, 10);
    dayKeys.add(localKey);
    dayKeys.add(startUtcKey);
    dayKeys.add(endUtcKey);

    const refs = Array.from(dayKeys).map((k) => ref(db, `prints/${k}`));
    const snaps = await Promise.all(refs.map((r) => get(r)));
    const records = collectRecordsWithinWindow(snaps, start, end);
    return getNextPrSequenceFromRecords(records, { coperionPrefixForDay });
}

// Helper: day-of-year (1..365/366)
function getDayOfYear(date) {
    const start = new Date(date.getFullYear(), 0, 1);
    const diffMs = date - start;
    const oneDayMs = 24 * 60 * 60 * 1000;
    return Math.floor(diffMs / oneDayMs) + 1;
}

// Compute the next Coperion daily sequence (last three digits) for the given date.
// Rules:
// - Prefix for Coperion: EA + 1 + last-digit-of-year + day-of-year (DDD)
// - Last three digits start at 401 each new day (00:01 rule applies)
// - Increments based on existing regular (non-RI) records in DB that match the day's EA prefix
// - Returns the next suffix within 401..999
export async function getNextCoperionSequenceFromFirebase(date) {
    const db = getDatabaseInstance();
    const input = date instanceof Date ? date : new Date(date || Date.now());

    // Apply 00:01 rule: 00:00-00:01 belongs to previous day
    const effective = new Date(input);
    const minutesSinceMidnight =
        effective.getHours() * 60 + effective.getMinutes();
    if (minutesSinceMidnight < 1) {
        effective.setMinutes(effective.getMinutes() - 1);
    }

    // Local day boundaries
    const start = new Date(effective);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    // Build the EA prefix for the day: EA1[Y][DDD]
    const yearDigit = String(effective.getFullYear()).slice(-1);
    const doyStr = String(getDayOfYear(effective)).padStart(3, "0");
    const prefix = `EA1${yearDigit}${doyStr}`;

    // Determine which buckets to read:
    // - local day key (new writes)
    // - UTC day keys spanning this local day (legacy writes / timezone edge)
    const dayKeys = new Set();
    const localKey = formatLocalDayKey(start);
    const startUtcKey = start.toISOString().slice(0, 10);
    const endUtcKey = new Date(end.getTime() - 1).toISOString().slice(0, 10);
    dayKeys.add(localKey);
    dayKeys.add(startUtcKey);
    dayKeys.add(endUtcKey);

    const refs = Array.from(dayKeys).map((k) => ref(db, `prints/${k}`));
    const snaps = await Promise.all(refs.map((r) => get(r)));
    const records = collectRecordsWithinWindow(snaps, start, end);
    return getNextCoperionSequenceFromRecords(records, { prefix });
}

// Compute the next Compound+BAGS daily sequence (last three digits) for the given date.
// Rules:
// - Applies only to prints where sourceGroup === "compound" AND product ends with "BAGS"
// - Last three digits start at 201 each new day (00:01 rule applie)
// - Increments based on existing regular (non-RI) matching records in DB
// - Returns the next suffix within 201..999
export async function getNextCompoundBagsSequenceFromFirebase(date) {
    const db = getDatabaseInstance();
    const input = date instanceof Date ? date : new Date(date || Date.now());

    // Apply 00:01 rule: 00:00-00:01 belongs to previous day
    const effective = new Date(input);
    const minutesSinceMidnight =
        effective.getHours() * 60 + effective.getMinutes();
    if (minutesSinceMidnight < 1) {
        effective.setMinutes(effective.getMinutes() - 1);
    }

    // Local day boundaries
    const start = new Date(effective);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    // Determine which buckets to read:
    // - local day key (new writes)
    // - UTC day keys spanning this local day (legacy writes / timezone edge)
    const dayKeys = new Set();
    const localKey = formatLocalDayKey(start);
    const startUtcKey = start.toISOString().slice(0, 10);
    const endUtcKey = new Date(end.getTime() - 1).toISOString().slice(0, 10);
    dayKeys.add(localKey);
    dayKeys.add(startUtcKey);
    dayKeys.add(endUtcKey);

    const refs = Array.from(dayKeys).map((k) => ref(db, `prints/${k}`));
    const snaps = await Promise.all(refs.map((r) => get(r)));
    const records = collectRecordsWithinWindow(snaps, start, end);
    return getNextCompoundBagsSequenceFromRecords(records);
}

function parseIsoDateOrNow(value) {
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d : new Date();
}

// For times between 00:00 and 00:01 (exclusive), treat as previous day.
// Matches the "00:01 rule" used in unit number generation.
function apply0001Rule(date) {
    const d = new Date(date);
    const minutesSinceMidnight = d.getHours() * 60 + d.getMinutes();
    if (minutesSinceMidnight < 1) {
        d.setMinutes(d.getMinutes() - 1);
    }
    return d;
}

function formatLocalDayKey(date) {
    const d = new Date(date);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
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
