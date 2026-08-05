// Central state and shared screen helpers
import { generateBigCode } from "./utils/generators.js";
import { normalizeProductValue } from "./utils/product-selection.js";

export const state = {
    source: { silo: null, dryer: null, compound: null, special: null },
    activeGroup: null,
    // Legacy single-product state (kept for backward compatibility with older code paths).
    // New flows should use product slots (primary/secondary) + activeProductSlot.
    selectedProduct: null,
    // Two-slot product selection (all groups except Bulk/Silo).
    // BLANK is represented as null in state/persistence.
    productSlots: { primary: null, secondary: null },
    // Which slot is currently being used for the label / edits.
    activeProductSlot: "primary",
    weights: { netLb: 0, grossLb: 0, tareLb: 0 },
    unitNumber: "AC1001001",
    bigCode: generateBigCode(),
    // Flag to indicate Coperion-specific flow/numbering
    isCoperion: false,
    excelHandle: null,
    // Last successfully printed label snapshot for reprint
    lastPrinted: null,
    // Optional override for preview timestamp (used during reprint)
    previewTimestamp: null,
    // Whether the next click should reprint the last label
    reprintAvailable: false,
    // Flag and metadata for reissue flow
    reissueFlag: "",
    reissueOriginalUnit: null,
    // Distinguish between existing-label reissue vs new-box reissue flows.
    // - null: not in a reissue flow
    // - "existing": reissue an existing label
    // - "new": create/reissue a label for a lot not yet in system
    // Password is required when opening Manual Entry / Reissue from the source screen.
    reissueFlowType: null,
    // Prevents preview from overwriting a newly generated reissue unit number
    lockUnitNumberOnce: false,
};

export const screens = {
    auth: null,
    source: null,
    products: null,
    weights: null,
    preview: null,
    labeldb: null,
    coperion: null,
};

export function showScreen(name) {
    const wasOnPreview = Boolean(
        screens.preview && screens.preview.classList.contains("active"),
    );
    Object.values(screens).forEach((s) => s && s.classList.remove("active"));
    const el = screens[name];
    if (el) el.classList.add("active");

    // P&R preview is exclusively locked while a station is on Preview (or Label DB).
    // Leaving that session releases the shared lock for other computers.
    const staysInPreviewSession = name === "preview" || name === "labeldb";
    if (wasOnPreview && !staysInPreviewSession) {
        void import("./preview-lock.js")
            .then((m) => m.releasePrPreviewLockIfHeld())
            .catch(() => {});
    }
}

export const BLANK_PRODUCT_LABEL = "BLANK";

export function isBulkSiloGroup(sourceGroup) {
    const group = String(sourceGroup || "").toLowerCase();
    return group === "silo" || group === "bulk";
}

export function isTwoSlotProductContext(sourceGroup) {
    const group = String(sourceGroup || "").toLowerCase();
    if (!group) return false;
    // Bulk / Silo continues to have only one slot.
    return !isBulkSiloGroup(group);
}

export function formatProductForDisplay(value) {
    return normalizeProductValue(value) ? String(value).trim() : BLANK_PRODUCT_LABEL;
}

export function getActiveProductFromSlots(slots, activeSlot) {
    const slot = activeSlot === "secondary" ? "secondary" : "primary";
    const value = slots && slot in slots ? slots[slot] : null;
    return normalizeProductValue(value);
}

