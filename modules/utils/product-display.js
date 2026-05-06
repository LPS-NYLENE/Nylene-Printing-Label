export function splitProductDisplayLines(productCode) {
    const raw = typeof productCode === "string" ? productCode.trim() : "";
    if (!raw) return ["—"];

    const gradedBagsMatch = raw.match(/^(.*?)(-(01|02)BAGS)$/);
    if (gradedBagsMatch && gradedBagsMatch[1])
        return [gradedBagsMatch[1], gradedBagsMatch[2]];

    const bagsMatch = raw.match(/^(.*?)(BAGS)$/);
    if (bagsMatch && bagsMatch[1]) return [bagsMatch[1], bagsMatch[2]];

    const gradedMatch = raw.match(/^(.*?)(-(01|02))$/);
    if (gradedMatch) return [gradedMatch[1], gradedMatch[2]];

    return [raw];
}
