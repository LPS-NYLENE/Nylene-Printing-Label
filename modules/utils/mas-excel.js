const TEXT_FORMAT = "@";

const MAS_HEADER = [
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

const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toValidDate(value) {
    const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function textCell(value) {
    return {
        t: "s",
        v: value == null ? "" : String(value),
        z: TEXT_FORMAT,
    };
}

function dateCell(value) {
    const date = toValidDate(value);
    if (!date) return textCell("");
    return {
        t: "n",
        v:
            (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) -
                EXCEL_EPOCH_MS) /
            MS_PER_DAY,
        z: "mm/dd/yy",
    };
}

function timeCell(value) {
    const date = toValidDate(value);
    if (!date) return textCell("");
    return {
        t: "n",
        v:
            (date.getHours() * 60 * 60 * 1000 +
                date.getMinutes() * 60 * 1000 +
                date.getSeconds() * 1000 +
                date.getMilliseconds()) /
            MS_PER_DAY,
        z: "h:mm AM/PM",
    };
}

export function buildMasSheetData(rows) {
    return [MAS_HEADER.map(textCell), ...rows.map(buildMasSheetRow)];
}

function buildMasSheetRow(row) {
    const values = Array.isArray(row?.values) ? row.values : [];
    return [dateCell(row?.timestamp), timeCell(row?.timestamp), ...values.map(textCell)];
}

export function buildObjectSheetData(records, options = {}) {
    const rows = Array.isArray(records) ? records : [];
    const keys = Array.isArray(options.keys) && options.keys.length
        ? options.keys
        : collectKeys(rows);
    const typeMap = options.typeMap || {};
    const headerMap = options.headerMap || {};

    return [
        keys.map((key) => textCell(headerMap[key] || key)),
        ...rows.map((row) =>
            keys.map((key) => buildCell(typeMap[key] || "text", row?.[key]))
        ),
    ];
}

function buildCell(type, value) {
    if (type === "date") return dateCell(value);
    if (type === "time") return timeCell(value);
    if (type === "datetime") return dateTimeCell(value);
    return textCell(value);
}

function dateTimeCell(value) {
    const date = toValidDate(value);
    if (!date) return textCell("");
    return {
        t: "n",
        v: (date.getTime() - EXCEL_EPOCH_MS) / MS_PER_DAY,
        z: "mm/dd/yy h:mm AM/PM",
    };
}

function collectKeys(rows) {
    const keys = [];
    const seen = new Set();
    for (const row of rows) {
        if (!row || typeof row !== "object") continue;
        for (const key of Object.keys(row)) {
            if (seen.has(key)) continue;
            seen.add(key);
            keys.push(key);
        }
    }
    return keys;
}
