export const MAX_WEIGHT_DIFFERENCE_LB = 200;

export function getMaxWeightDifferenceError(netLb, grossLb) {
    const differenceLb = Math.abs(Number(grossLb) - Number(netLb));
    return differenceLb > MAX_WEIGHT_DIFFERENCE_LB
        ? "Difference between net and gross weight cannot exceed 200 lbs."
        : "";
}