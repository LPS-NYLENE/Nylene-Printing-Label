import { resolveMaterialNumber } from "./material-numbers.js";

export const MAS_HEADER = [
    "DATE",
    "TIME",
    "0",
    "",
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

function normalizeMasDateInput(value) {
    const input = value instanceof Date ? value : new Date(value || Date.now());
    return Number.isNaN(input.getTime()) ? new Date() : input;
}

export function orderMasRecordsForExcel(records) {
    if (!Array.isArray(records)) return [];
    return records
        .map((rec, index) => ({ rec, index }))
        .sort((a, b) => {
            const at = String(a.rec?.timestamp || "");
            const bt = String(b.rec?.timestamp || "");
            const cmp = bt.localeCompare(at);
            if (cmp !== 0) return cmp;
            return a.index - b.index;
        })
        .map(({ rec }) => rec);
}

export function formatMasDate(value) {
    const dt = normalizeMasDateInput(value);
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(dt.getMonth() + 1)}/${pad(dt.getDate())}/${dt
        .getFullYear()
        .toString()
        .slice(-2)}`;
}

export function formatMasTime(value) {
    const dt = normalizeMasDateInput(value);
    const hours = dt.getHours();
    const hour12 = hours % 12 || 12;
    const suffix = hours >= 12 ? "PM" : "AM";
    return `${hour12}:${String(dt.getMinutes()).padStart(2, "0")} ${suffix}`;
}

export function formatMasWeight(value) {
    const weight = Number(value || 0);
    return weight.toFixed(1);
}

function resolvePrefixFromUnit(unit) {
    if (!unit || typeof unit !== "string") return "";
    return unit.slice(0, 2).toUpperCase();
}

export function formatForMasExcel(rec) {
    const product = rec.product || "";
    const unit = rec.unitNumber || "";
    const materialNumber =
        (rec && rec.materialNumber ? String(rec.materialNumber) : "") ||
        resolveMaterialNumber(product);

    return [
        formatMasDate(rec.timestamp),
        formatMasTime(rec.timestamp),
        0,
        "",
        product,
        unit,
        formatMasWeight(rec.grossLb),
        formatMasWeight(rec.netLb),
        formatMasWeight(rec.tareLb),
        1,
        materialNumber,
        resolvePrefixFromUnit(unit),
        2003,
        "LB",
    ];
}

export function buildMasHeaderAndRows(rows) {
    return [MAS_HEADER.slice(), ...rows];
}
