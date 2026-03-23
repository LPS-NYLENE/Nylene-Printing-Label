import { state } from "./state.js";
import { lbToKg } from "./utils/format.js";
import { withExcelSource, resolveExcelSource } from "./utils/export-source.js";
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
        const existing = XLSX.utils.sheet_to_json(ws);
        const merged = mergeByTimestamp(existing, logs);
        const ordered = orderRecordsForExcel(merged);
        const newWs = XLSX.utils.json_to_sheet(buildLogsSheetRows(ordered));
        wb.Sheets[wsName] = newWs;
        const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
        const writable = await fileHandle.createWritable();
        await writable.write(out);
        await writable.close();
    } catch (e) {
        const wb = XLSX.utils.book_new();
        const ordered = orderRecordsForExcel(logs);
        const ws = XLSX.utils.json_to_sheet(buildLogsSheetRows(ordered));
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

function normalizeUnitNumber(value) {
    return String(value || "").trim().toUpperCase();
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
        const cmp = at.localeCompare(bt);
        if (cmp !== 0) return cmp;
        return a.index - b.index;
    });

    const baseRecords = [];
    const reissuesByOriginal = new Map();
    const reissuesInOrder = [];
    for (const { rec } of decorated) {
        const isReissue = isReissueRecord(rec);
        const originalKey = normalizeUnitNumber(rec?.reissueOriginalUnit);
        if (isReissue && originalKey) {
            if (!reissuesByOriginal.has(originalKey))
                reissuesByOriginal.set(originalKey, []);
            reissuesByOriginal.get(originalKey).push(rec);
            reissuesInOrder.push(rec);
        } else {
            baseRecords.push(rec);
        }
    }

    const output = [];
    const attached = new Set();
    const usedOriginals = new Set();
    for (const rec of baseRecords) {
        output.push(rec);
        const unitKey = normalizeUnitNumber(rec?.unitNumber);
        if (!unitKey || usedOriginals.has(unitKey)) continue;
        const reissues = reissuesByOriginal.get(unitKey);
        if (reissues && reissues.length) {
            reissues.forEach((r) => attached.add(r));
            output.push(...reissues);
        }
        usedOriginals.add(unitKey);
    }

    for (const rec of reissuesInOrder) {
        if (!attached.has(rec)) output.push(rec);
    }

    return output;
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
            const ordered = orderRecordsForExcel(loadLogs());
            const logs = ordered.map(formatForMasExcel);
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
                const ordered = orderRecordsForExcel(firebaseLogs);
                const rows = ordered.map(formatForMasExcel);
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
                const ordered = orderRecordsForExcel(loadLogs());
                const logs = ordered.map(formatForMasExcel);
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
                const ordered = orderRecordsForExcel(loadLogs());
                const wb = XLSX.utils.book_new();
                const ws = XLSX.utils.json_to_sheet(buildLogsSheetRows(ordered));
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
    const source = resolveExcelSource(rec);
    const code2003 = 2003;
    const unitType = "LB";
    const reissueFlag = String(rec && rec.reissueFlag ? rec.reissueFlag : "");
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
        source,
        code2003,
        unitType,
        reissueFlag === "RI" ? "RI" : "",
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
        "SOURCE",
        "2003",
        "UOM",
        "RI",
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
