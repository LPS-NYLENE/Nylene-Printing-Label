// Material number resolver for MAS export / logs.
//
// Goal: avoid blank material numbers in exports by persisting the resolved
// material number into the print log at print-time.
//
// The mapping below is based on the provided product list (sheet screenshot).

function normalizeProductLabel(value) {
    const raw = typeof value === "string" ? value : "";
    return raw
        .trim()
        .toUpperCase()
        .replace(/_/g, " ")
        .replace(/[.,]/g, "") // remove punctuation that varies in UI lists
        .replace(/\s*-\s*/g, " - ") // normalize dash spacing
        .replace(/\s+/g, " ");
}

// Raw mapping (keys can be "pretty" labels or short codes).
// We normalize keys at runtime so lookups are resilient to spacing/casing.
const RAW_MATERIAL_NUMBERS = {
    // Highlighted/critical item from the screenshot:
    "Nylene BX3WQ662 - OCT": "10248654",

    // Common short-code fallbacks used by the app UI:
    BX3WQ662: "10248654",

    // Additional mappings from the provided list (best-effort coverage)
    // "CAPROLACTAM 80% LSG - TOTE": "10249763",
    // "NYLENE 406C-NAT BPL": "10305400",
    "700D": "10305571",
    BS580A: "10305440",
    BS600CSDN: "10300934",
    BS640AFOIL: "10305694",
    BS640A: "10278232",
    BS640T: "10300937",
    BS640UX: "10305770",
    BS700A: "10249867",
    BS700AFOIL: "10248660",
    BS700D: "10249875",
    BS700RA: "10252715",
    // "BS700D": "10305514",
    BS700R80: "10305405",
    BX3LF: "10305427",
    "BX3RF-01": "10305837",
    BX3RF: "10305721",
    // "BX3WQ662": "10277933",
    BX3WQ662X: "10301835",
    // "BX3WQ662X": "10249330-",
    "BX3WQ662X FOIL": "10305291",
    "BX3WQ662X-01": "10305806",
    "BX3WQ662X-02": "10300936",
    CSDNINT: "10300933",
    "INT 190": "10305834",
    "PA6-205": "10305680",
    "BS700A BPL": "10305474",
    "400-C": "10305436",
    "BX3-C": "10305464",
    "BX3-C-BPL": "10305465",
    "406F-NAT  BPL": "10305478",
    "615C": "10305308",
    "NX1440 - C - BPL": "10305376",
    "BS640A - BPL": "10305280",
    "615SA-": "10305651",
    BS640AB3: "10305441",
    "615C BPL": "10305466",
    "BX3 ": "10248650",
    "NYLENE BX3RF-BPL": "10305722",
};

const MATERIAL_NUMBERS_BY_KEY = Object.fromEntries(
    Object.entries(RAW_MATERIAL_NUMBERS).map(([k, v]) => [
        normalizeProductLabel(k),
        String(v),
    ])
);

export function resolveMaterialNumber(productLabelOrCode) {
    const key = normalizeProductLabel(productLabelOrCode);
    return MATERIAL_NUMBERS_BY_KEY[key] || "";
}
