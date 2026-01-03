import { state } from "./state.js";
import { lbToKg } from "./utils/format.js";
import { resolveMaterialNumber } from "./utils/material-numbers.js";
import {
    savePrintToFirebase,
    fetchAllPrintsFromFirebase,
} from "./firebase-db.js";

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
    return {
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
    };
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
        const existing = XLSX.utils.sheet_to_json(ws);
        const merged = mergeByTimestamp(existing, logs);
        const newWs = XLSX.utils.json_to_sheet(merged);
        wb.Sheets[wsName] = newWs;
        const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
        const writable = await fileHandle.createWritable();
        await writable.write(out);
        await writable.close();
    } catch (e) {
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(logs);
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

export function bindExcelButton() {
    const excelBtn = document.getElementById("excelBtn");
    if (!excelBtn) return;
    excelBtn.addEventListener("click", async () => {
        try {
            // Always fetch from Firebase and download an Excel immediately
            const firebaseLogs = await fetchAllPrintsFromFirebase();
            const rows = firebaseLogs.map(formatForMasExcel);
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.aoa_to_sheet(buildMasHeaderAndRows(rows));
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
            const logs = loadLogs().map(formatForMasExcel);
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.aoa_to_sheet(buildMasHeaderAndRows(logs));
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
                const rows = firebaseLogs.map(formatForMasExcel);
                const wb = XLSX.utils.book_new();
                const ws = XLSX.utils.aoa_to_sheet(buildMasHeaderAndRows(rows));
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
                const logs = loadLogs().map(formatForMasExcel);
                const wb = XLSX.utils.book_new();
                const ws = XLSX.utils.aoa_to_sheet(buildMasHeaderAndRows(logs));
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
                const logs = loadLogs();
                const wb = XLSX.utils.book_new();
                const ws = XLSX.utils.json_to_sheet(logs);
                XLSX.utils.book_append_sheet(wb, ws, "Logs");
                XLSX.writeFile(
                    wb,
                    `label-logs-${new Date().toISOString().slice(0, 10)}.xlsx`
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
// Target columns per provided image:
// [Date, Time, 0, Product, Batch/Unit, Certificate, Net LBS, Net KGS,
//  Tare LBS, Quantity(=1), Material Number, Source Code, 2003, LB]
function formatForMasExcel(rec) {
    const dt = new Date(rec.timestamp || Date.now());
    const pad = (n) => String(n).padStart(2, "0");
    const dateStr = `${pad(dt.getMonth() + 1)}/${pad(dt.getDate())}/${dt
        .getFullYear()
        .toString()
        .slice(-2)}`;
    const timeStr = `${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
    const zero = 0;
    const product = rec.product || "";
    const unit = rec.unitNumber || "";
    const grossLb = Number(rec.grossLb || 0);
    const netLb = Number(rec.netLb || 0);
    const tareLb = Number(rec.tareLb || 0);
    const qty = 1;
    const materialNumber =
        (rec && rec.materialNumber ? String(rec.materialNumber) : "") ||
        resolveMaterialNumber(product);
    const prefix = resolvePrefixFromUnit(unit);
    const code2003 = 2003;
    const unitType = "LB";
    return [
        dateStr,
        timeStr,
        zero,
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
    ];
}

function buildMasHeaderAndRows(rows) {
    const header = [
        "DATE",
        "TIME",
        "0",
        "PRODUCT",
        "UNIT",
        "GROSS LB",
        "NET LB",
        "TARE LB",
        "QTY",
        "MATERIAL",
        "PREFIX",
        "2003",
        "UOM",
    ];
    return [header, ...rows];
}

function resolveCertificateForProduct(product) {
    // Placeholder: empty or lookup table; keep blank by default
    return "";
}

function resolvePrefixFromUnit(unit) {
    if (!unit || typeof unit !== "string") return "";
    return unit.slice(0, 2).toUpperCase();
}
