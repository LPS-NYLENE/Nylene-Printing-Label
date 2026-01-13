// Shared product classification helpers

// True when the product name indicates a "bags" label.
// We treat any substring match (case-insensitive) as bags.
export function isBagsProduct(product) {
    const v = typeof product === "string" ? product : "";
    return v.toLowerCase().includes("bags");
}

