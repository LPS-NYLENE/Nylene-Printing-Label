// Centralized product choice lists used across UI entry points.
// Keep these lists small, explicit, and stable to prevent operator typos.

function dedupeStable(list) {
    const seen = new Set();
    const out = [];
    (list || []).forEach((item) => {
        const value = String(item || "").trim();
        if (!value) return;
        if (seen.has(value)) return;
        seen.add(value);
        out.push(value);
    });
    return out;
}

// Default fallback when no prior selection exists for a context.
export const PR_DEFAULT_PRODUCT = "BLANK";

// Allowed products for P&R (from provided list)
export const PR_PRODUCT_CHOICES = dedupeStable([
    "CSDN-INT",
    "BS700D",
    "BS640T",
    "BS640A",
    "BS640AFOIL",
    "BS600CSDN",
    "BS700AFOIL",
    "BS700RA",
    "BX3WQ662X",
    "BX3WQ662X-01",
    "BX3WQ662-02",
    "BX3WQ662",
    "BX3RF",
    "BX3RF-01",
    "BX3LF",
    "BX3WQ662XBAGS",
    "BX3WQ662BAGS",
    "WASTE",
    "OLIGOMERS",
    "SLUDGE",
    "UNEXT-CHIP",
    "CAPRO",
    "BS700R80",
    "BS640UX",
    "PA6-205",
    "BS700A",
    "BX3WQ662X-02BAGS",
    "L-195-1",
    "L-195-2",
    "L-196",
    "700D-INT",
    "INT-190",
]);

export const COPERION_DEFAULT_PRODUCT = "BX3WQ662";

export const COPERION_PRODUCT_CHOICES = dedupeStable([
    COPERION_DEFAULT_PRODUCT,
    "BX3WQ662X",
    "BX3WQ662X-01",
    "BX3WQ662-02",
    "BX3RF",
    "BX3RF-01",
    "BX3LF",
]);
