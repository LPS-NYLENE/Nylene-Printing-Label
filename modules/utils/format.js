export function lbToKg(lb) {
    return +(lb * 0.45359237).toFixed(1);
}

export function parseNumber(value) {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : 0;
}

