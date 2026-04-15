import { fetchAllPrintsFromFirebase } from "../firebase-db.js";
import { loadLogs } from "../logs.js";
import {
    selectLatestPrintRecordByFlow,
    selectLatestPrintRecordByUnit,
} from "./print-record-selection.js";

export async function findLatestPrintRecordByFlow(isCoperion) {
    const rows = await fetchAllPrintsFromFirebase();
    return selectLatestPrintRecordByFlow(rows, isCoperion);
}

export async function findLatestPrintRecordByUnit(unitNumber) {
    try {
        const rows = await fetchAllPrintsFromFirebase();
        const match = selectLatestPrintRecordByUnit(rows, unitNumber);
        if (match) return match;
    } catch (e) {
        console.warn("Firebase search failed, falling back to local logs", e);
    }

    const local = loadLogs();
    return selectLatestPrintRecordByUnit(local, unitNumber);
}

