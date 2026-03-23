const PR_SOURCE_PREFIXES = new Set([
    "AC",
    "AD",
    "BD",
    "CD",
    "DE",
    "AS",
    "BS",
    "CS",
    "DS",
    "BC",
    "UX",
    "LT",
]);

function normalizePrefix(value) {
    return String(value || "")
        .trim()
        .toUpperCase()
        .slice(0, 2);
}

export function resolveExcelSource(record) {
    const unitPrefix = normalizePrefix(record?.unitNumber);
    if (unitPrefix === "EA") return "Coperion";

    const productPrefix = normalizePrefix(record?.product);
    if (
        PR_SOURCE_PREFIXES.has(unitPrefix) ||
        PR_SOURCE_PREFIXES.has(productPrefix)
    ) {
        return "P&R";
    }

    const productLine = String(record?.productLine || "").trim();
    if (productLine === "Coperion" || productLine === "P&R") {
        return productLine;
    }

    return "";
}

export function withExcelSource(record) {
    return {
        ...(record || {}),
        source: resolveExcelSource(record),
    };
}
