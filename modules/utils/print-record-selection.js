import { inferIsCoperionFromRecord } from "./reprint-snapshot.js";

function findLastMatchingRecord(records, predicate) {
    if (!Array.isArray(records) || !records.length) return null;
    for (let i = records.length - 1; i >= 0; i -= 1) {
        const record = records[i];
        if (predicate(record)) return record;
    }
    return null;
}

export function selectLatestPrintRecordByFlow(records, isCoperion) {
    const expectedFlow = Boolean(isCoperion);
    return findLastMatchingRecord(
        records,
        (record) => inferIsCoperionFromRecord(record) === expectedFlow,
    );
}

export function selectLatestPrintRecordByUnit(records, unitNumber) {
    const normalized = String(unitNumber || "").trim().toUpperCase();
    if (!normalized) return null;
    return findLastMatchingRecord(
        records,
        (record) =>
            String(record?.unitNumber || "").trim().toUpperCase() === normalized,
    );
}
