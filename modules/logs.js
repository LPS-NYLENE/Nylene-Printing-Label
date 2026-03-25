import { state } from "./state.js";
import { lbToKg } from "./utils/format.js";
import { withExcelSource } from "./utils/export-source.js";
import {
    buildMasSheetData,
    buildObjectSheetData,
} from "./utils/mas-excel.js";
import { resolveMaterialNumber } from "./utils/material-numbers.js";
import {
    savePrintToFirebase,
    fetchAllPrintsFromFirebase,
} from "./firebase-db.js";
import { getAppInstance } from "./firebase-db.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { applyExcelButtonAccess, isExcelExportAllowed } from "./access.js";

const LOGS_KEY = "print_logs_v1";

export function loadLogs() {
    try {
        const raw = localStorage.getItem(LOGS_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

export function saveLogs(logs) {
    localStorage.setItem(LOGS_KEY, JSON.stringify(logs));
}

export function buildLogRecord() {
    const now = new Date();
    const toIso = (d) => new Date(d).toISOString();
    const group = state.activeGroup || "";
    const letter = group ? state.source[group] || "" : "";
    const product = state.bigCode;
    const record = {
        timestamp: toIso(now),
        unitNumber: state.unitNumber,
        product,
        // Persist material number at print-time so exports are deterministic.
        materialNumber: resolveMaterialNumber(product),
        sourceGroup: group,
        productLine: state.isCoperion ? "Coperion" : "P&R",
        sourceLetter: letter,
        special: state.source.special || "",
        grossLb: Number(state.weights.grossLb || 0),
        grossKg: lbToKg(Number(state.weights.grossLb || 0)),
        netLb: Number(state.weights.netLb || 0),
        netKg: lbToKg(Number(state.weights.netLb || 0)),
        tareLb: Number(state.weights.tareLb || 0),
        tareKg: lbToKg(Number(state.weights.tareLb || 0)),
        reissueOriginalUnit:
            state.reissueFlag === "RI" ? state.reissueOriginalUnit || "" : "",
        reissueFlag: state.reissueFlag === "RI" ? "RI" : "",
    };
    return withExcelSource(record);
}

export async function appendLogRecord() {
    const logs = loadLogs();
    const record = buildLogRecord();
    logs.push(record);
    saveLogs(logs);
    // Best-effort: also persist to Firebase Realtime Database
    try {
        await savePrintToFirebase(record);
    } catch (e) {
        console.warn("Failed to write to Firebase", e);
    }
    if (state.excelHandle && (await verifyHandleWriteable(state.excelHandle))) {
        await appendToExcelFile(state.excelHandle, logs);
    }
}

async function verifyHandleWriteable(handle) {
    try {
        if (
            (await handle.queryPermission({ mode: "readwrite" })) !== "granted"
        ) {
            const res = await handle.requestPermission({ mode: "readwrite" });
            if (res !== "granted") return false;
        }
        return true;
    } catch {
        return false;
    }
}

async function appendToExcelFile(fileHandle, logs) {
    try {
        const file = await fileHandle.getFile();
        const arrayBuffer = await file.arrayBuffer();
        const wb = XLSX.read(arrayBuffer, { type: "array" });
        const wsName = wb.SheetNames[0] || "Logs";
        const ws = wb.Sheets[wsName];
        const existing = XLSX.utils
            .sheet_to_json(ws, { raw: false })
            .map(normalizeExistingLogRow);
        const merged = mergeByTimestamp(existing, logs);
        const ordered = orderRecordsForExcel(merged);
        const newWs = buildLogsWorksheet(ordered);
        wb.Sheets[wsName] = newWs;
        const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
        const writable = await fileHandle.createWritable();
        await writable.write(out);
        await writable.close();
    } catch (e) {
        const wb = XLSX.utils.book_new();
        const ordered = orderRecordsForExcel(logs);
        const ws = buildLogsWorksheet(ordered);
        XLSX.utils.book_append_sheet(wb, ws, "Logs");
        const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
        const writable = await fileHandle.createWritable();
        await writable.write(out);
        await writable.close();
    }
}

function mergeByTimestamp(existingRows, newRows) {
    const seen = new Set(
        existingRows.map((r) => r.timestamp + ":" + r.unitNumber)
    );
    const merged = existingRows.slice();
    for (const r of newRows) {
        const key = r.timestamp + ":" + r.unitNumber;
        if (!seen.has(key)) {
            seen.add(key);
            merged.push(r);
        }
    }
    return merged;
}

function buildLogsSheetRows(records) {
    return records.map(withExcelSource);
}

function buildLogsWorksheet(records) {
    return XLSX.utils.aoa_to_sheet(
        buildObjectSheetData(buildLogsSheetRows(records), {
            typeMap: { timestamp: "datetime" },
        })
    );
}

function normalizeExistingLogRow(row) {
    if (!row || typeof row !== "object") return row;
    return {
        ...row,
        timestamp: normalizeTimestamp(row.timestamp),
    };
}

function normalizeTimestamp(value) {
    if (!value) return "";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

function isReissueRecord(record) {
    return String(record?.reissueFlag || "").toUpperCase() === "RI";
}

function orderRecordsForExcel(records) {
    if (!Array.isArray(records)) return [];
    const decorated = records.map((rec, index) => ({ rec, index }));
    decorated.sort((a, b) => {
        const at = String(a.rec?.timestamp || "");
        const bt = String(b.rec?.timestamp || "");
        const cmp = bt.localeCompare(at);
        if (cmp !== 0) return cmp;
        return a.index - b.index;
    });
    return decorated.map(({ rec }) => rec);
}

export function bindExcelButton() {
    const excelBtn = document.getElementById("excelBtn");
    if (!excelBtn) return;

    // Ensure the button is hidden/disabled appropriately on first bind.
    try {
        const auth = getAuth(getAppInstance());
        applyExcelButtonAccess(auth.currentUser);
    } catch {
        // If auth isn't available for any reason, default to locked down.
        applyExcelButtonAccess(null);
    }

    excelBtn.addEventListener("click", async () => {
        try {
            // Safety check: enforce access even if DOM is modified.
            const auth = getAuth(getAppInstance());
            if (!isExcelExportAllowed(auth.currentUser)) {
                // Keep this quiet other than a simple message.
                alert("Not authorized to export Excel.");
                return;
            }

            // Always fetch from Firebase and download an Excel immediately
            const firebaseLogs = await fetchAllPrintsFromFirebase();
            const ordered = orderRecordsForExcel(firebaseLogs);
            const rows = ordered.map(formatForMasExcel);
            const wb = XLSX.utils.book_new();
            const ws = buildMasWorksheet(rows);
            XLSX.utils.book_append_sheet(wb, ws, "MASOutput");
            XLSX.writeFile(
                wb,
                `MASOutput-${new Date().toISOString().slice(0, 10)}.xlsx`
            );
        } catch (e) {
            console.warn(
                "Firebase export failed, falling back to local logs",
                e
            );
            const ordered = orderRecordsForExcel(loadLogs());
            const logs = ordered.map(formatForMasExcel);
            const wb = XLSX.utils.book_new();
            const ws = buildMasWorksheet(logs);
            XLSX.utils.book_append_sheet(wb, ws, "MASOutput");
            XLSX.writeFile(
                wb,
                `MASOutput-${new Date().toISOString().slice(0, 10)}.xlsx`
            );
        }
    });

    const exportBtn = document.getElementById("exportLogsBtn");
    if (exportBtn)
        exportBtn.addEventListener("click", async () => {
            try {
                const firebaseLogs = await fetchAllPrintsFromFirebase();
                const ordered = orderRecordsForExcel(firebaseLogs);
                const rows = ordered.map(formatForMasExcel);
                const wb = XLSX.utils.book_new();
                const ws = buildMasWorksheet(rows);
                XLSX.utils.book_append_sheet(wb, ws, "MASOutput");
                XLSX.writeFile(
                    wb,
                    `MASOutput-${new Date().toISOString().slice(0, 10)}.xlsx`
                );
            } catch (e) {
                console.warn(
                    "Firebase export failed, falling back to local logs",
                    e
                );
                const ordered = orderRecordsForExcel(loadLogs());
                const logs = ordered.map(formatForMasExcel);
                const wb = XLSX.utils.book_new();
                const ws = buildMasWorksheet(logs);
                XLSX.utils.book_append_sheet(wb, ws, "MASOutput");
                XLSX.writeFile(
                    wb,
                    `MASOutput-${new Date().toISOString().slice(0, 10)}.xlsx`
                );
            }
        });

    const cloudBtn = document.getElementById("exportCloudExcelBtn");
    if (cloudBtn)
        cloudBtn.addEventListener("click", async () => {
            const original = cloudBtn.textContent;
            try {
                cloudBtn.disabled = true;
                cloudBtn.textContent = "Exporting…";
                const url = await getCloudExportUrl();
                window.location.href = url;
            } catch (e) {
                console.warn(
                    "Cloud export failed, falling back to local export",
                    e
                );
                const ordered = orderRecordsForExcel(loadLogs());
                const rows = ordered.map(formatForMasExcel);
                const wb = XLSX.utils.book_new();
                const ws = buildMasWorksheet(rows);
                XLSX.utils.book_append_sheet(wb, ws, "MASOutput");
                XLSX.writeFile(
                    wb,
                    `MASOutput-${new Date().toISOString().slice(0, 10)}.xlsx`
                );
            } finally {
                cloudBtn.disabled = false;
                cloudBtn.textContent = original;
            }
        });
}

function getExportEndpoint() {
    const region = "us-central1";
    const projectId = "nylene-label-printer";
    if (window && window.APP_EXPORT_URL) return window.APP_EXPORT_URL;
    return `https://${region}-${projectId}.cloudfunctions.net/exportLabelsToExcel`;
}

async function getCloudExportUrl() {
    const endpoint = getExportEndpoint();
    const resp = await fetch(endpoint, { method: "GET" });
    if (!resp.ok) throw new Error(`Export failed: ${resp.status}`);
    const data = await resp.json();
    if (!data || !data.downloadUrl)
        throw new Error("No downloadUrl from function");
    return data.downloadUrl;
}

// Convert an app log record into the MAS Excel row format.
function formatForMasExcel(rec) {
    const zero = 0;
    const reissueMarker = isReissueRecord(rec) ? "RI" : "";
    const product = rec.product || "";
    const unit = rec.unitNumber || "";
    const grossLb = formatMasWeight(rec.grossLb);
    const netLb = formatMasWeight(rec.netLb);
    const tareLb = formatMasWeight(rec.tareLb);
    const qty = 1;
    const materialNumber =
        (rec && rec.materialNumber ? String(rec.materialNumber) : "") ||
        resolveMaterialNumber(product);
    const prefix = resolvePrefixFromUnit(unit);
    const code2003 = 2003;
    const unitType = "LB";
    return {
        timestamp: rec.timestamp || Date.now(),
        values: [
            zero,
            reissueMarker,
            product,
            unit,
            grossLb,
            netLb,
            tareLb,
            qty,
            materialNumber,
            prefix,
            code2003,
            unitType,
        ],
    };
}

function buildMasWorksheet(rows) {
    return XLSX.utils.aoa_to_sheet(buildMasSheetData(rows));
}

function resolveCertificateForProduct(product) {
    // Placeholder: empty or lookup table; keep blank by default
    return "";
}

function resolvePrefixFromUnit(unit) {
    if (!unit || typeof unit !== "string") return "";
    return unit.slice(0, 2).toUpperCase();
}

function formatMasWeight(value) {
    const weight = Number(value || 0);
    return weight.toFixed(1);
}

