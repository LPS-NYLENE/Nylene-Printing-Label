function normalizeUnitNumber(value) {
    return String(value || "").trim().toUpperCase();
}

export function inferIsCoperionFromRecord(record) {
    const productLine = String(record?.productLine || "").trim();
    const unitNumber = normalizeUnitNumber(record?.unitNumber);
    return productLine === "Coperion" || unitNumber.startsWith("EA1");
}

export function buildPrintedSnapshotFromState(currentState, printedAt) {
    return {
        printedAt: printedAt || null,
        unitNumber: currentState.unitNumber,
        bigCode: currentState.bigCode,
        weights: { ...currentState.weights },
        source: { ...currentState.source },
        activeGroup: currentState.activeGroup,
        isCoperion: Boolean(currentState.isCoperion),
    };
}

export function buildPrintedSnapshotFromRecord(record) {
    if (!record) return null;

    const source = {
        silo: null,
        dryer: null,
        compound: null,
        special: record.special || null,
    };
    const sourceGroup = String(record.sourceGroup || "").toLowerCase();
    const sourceLetter = String(record.sourceLetter || "").toUpperCase();
    if (sourceGroup && sourceLetter) {
        source[sourceGroup] = sourceLetter;
    }

    return {
        printedAt: record.timestamp || null,
        unitNumber: normalizeUnitNumber(record.unitNumber),
        bigCode: String(record.product || "").trim(),
        weights: {
            grossLb: Number(record.grossLb || 0),
            netLb: Number(record.netLb || 0),
            tareLb: Number(record.tareLb || 0),
        },
        source,
        activeGroup: sourceGroup || null,
        isCoperion: inferIsCoperionFromRecord(record),
    };
}
