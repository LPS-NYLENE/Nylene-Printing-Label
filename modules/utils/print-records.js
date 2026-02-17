import { fetchAllPrintsFromFirebase } from "../firebase-db.js";
import { loadLogs } from "../logs.js";

function normalizeUnit(value) {
    return String(value || "").trim().toUpperCase();
}

export async function findLatestPrintRecordByUnit(unitNumber) {
    const normalized = normalizeUnit(unitNumber);
    if (!normalized) return null;

    try {
        const rows = await fetchAllPrintsFromFirebase();
        const matches = rows.filter(
            (r) => normalizeUnit(r && r.unitNumber) === normalized,
        );
        if (matches.length) return matches[matches.length - 1];
    } catch (e) {
        console.warn("Firebase search failed, falling back to local logs", e);
    }

    const local = loadLogs();
    const localMatches = local.filter(
        (r) => normalizeUnit(r && r.unitNumber) === normalized,
    );
    return localMatches.length ? localMatches[localMatches.length - 1] : null;
}

