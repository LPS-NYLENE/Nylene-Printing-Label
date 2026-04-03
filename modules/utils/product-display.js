export function splitProductDisplayLines(productCode) {
    const raw = typeof productCode === "string" ? productCode.trim() : "";
    if (!raw) return ["—"];

    const bagsMatch = raw.match(/^(.*?)(BAGS)$/);
    if (bagsMatch && bagsMatch[1]) return [bagsMatch[1], bagsMatch[2]];

    const gradedMatch = raw.match(/^(.*?)(-(01|02))$/);
    if (gradedMatch) return [gradedMatch[1], gradedMatch[2]];

    return [raw];
}
