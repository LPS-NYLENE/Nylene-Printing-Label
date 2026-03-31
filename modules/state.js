// Central state and shared screen helpers
import { generateBigCode } from "./utils/generators.js";
import {
    getProductCodesForContext,
    getDefaultProductRecord,
    saveSharedProductSelection,
    saveSharedProductSlots,
} from "./product-sync.js";

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
    // - "existing": reissue an existing label (password not required)
    // - "new": create/reissue a label for a lot not yet in system (password required)
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
    Object.values(screens).forEach((s) => s && s.classList.remove("active"));
    const el = screens[name];
    if (el) el.classList.add("active");
}

// Legacy local keys retained only as a one-time migration fallback.
const SELECTED_PRODUCTS_MAP_KEY = "selected_products_by_context_v1";
const SELECTED_PRODUCT_SLOTS_MAP_KEY = "selected_product_slots_by_context_v1";

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

export function normalizeProductValue(value) {
    const v = typeof value === "string" ? value.trim() : "";
    if (!v) return null;
    if (v.toUpperCase() === BLANK_PRODUCT_LABEL) return null;
    return v;
}

export function formatProductForDisplay(value) {
    return normalizeProductValue(value) ? String(value).trim() : BLANK_PRODUCT_LABEL;
}

function readSelectedProductsMap() {
    try {
        const raw = localStorage.getItem(SELECTED_PRODUCTS_MAP_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}

function readSelectedProductSlotsMap() {
    try {
        const raw = localStorage.getItem(SELECTED_PRODUCT_SLOTS_MAP_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}

function makeContextKey(sourceGroup, sourceLetter) {
    const group = String(sourceGroup || "").toLowerCase();
    const letter = String(sourceLetter || "").toUpperCase();
    if (!group || !letter) return null;
    return `${group}:${letter}`;
}

function getFlowPrefix() {
    return state.isCoperion ? "cop" : "pr";
}

function getSharedProductFlow() {
    return state.isCoperion ? "coperion" : "pr";
}

function makeNamespacedKey(baseKey) {
    if (!baseKey) return null;
    const prefix = getFlowPrefix();
    return `${prefix}:${baseKey}`;
}

function readLegacyProductForContextKey(baseKey) {
    const map = readSelectedProductsMap();
    const namespacedKey = makeNamespacedKey(baseKey);
    const preferred = namespacedKey ? map[namespacedKey] : undefined;
    if (typeof preferred === "string" && preferred) return preferred;
    const legacy = map[baseKey];
    return typeof legacy === "string" && legacy ? legacy : null;
}

function readLegacyProductSlotsForContextKey(baseKey) {
    const map = readSelectedProductSlotsMap();
    const namespacedKey = makeNamespacedKey(baseKey);
    const raw = namespacedKey ? map[namespacedKey] : undefined;
    if (!raw || typeof raw !== "object") return null;
    return {
        primary: normalizeProductValue(raw.primary),
        secondary: normalizeProductValue(raw.secondary),
    };
}

function queueLegacySingleMigration(sourceGroup, sourceLetter, product) {
    const normalized = normalizeProductValue(product);
    if (!normalized) return;
    void saveSharedProductSelection(
        getSharedProductFlow(),
        sourceGroup,
        sourceLetter,
        normalized,
    ).catch((err) => {
        console.warn("Failed to migrate legacy product selection", err);
    });
}

function queueLegacySlotsMigration(sourceGroup, sourceLetter, slots) {
    const normalizedSlots = {
        primary: normalizeProductValue(slots && slots.primary),
        secondary: normalizeProductValue(slots && slots.secondary),
    };
    if (!normalizedSlots.primary && !normalizedSlots.secondary) return;
    void saveSharedProductSlots(
        getSharedProductFlow(),
        sourceGroup,
        sourceLetter,
        normalizedSlots,
    ).catch((err) => {
        console.warn("Failed to migrate legacy product slots", err);
    });
}

export function getCurrentFlowDefaultProductCode() {
    return getDefaultProductRecord(getSharedProductFlow())?.code || null;
}

export function loadProductForContext(sourceGroup, sourceLetter) {
    const baseKey = makeContextKey(sourceGroup, sourceLetter);
    if (!baseKey) return null;

    const shared = normalizeProductValue(
        getProductCodesForContext(
            getSharedProductFlow(),
            sourceGroup,
            sourceLetter,
        ).primary,
    );
    if (shared) return shared;

    const legacy = normalizeProductValue(readLegacyProductForContextKey(baseKey));
    if (legacy) {
        queueLegacySingleMigration(sourceGroup, sourceLetter, legacy);
    }
    return legacy;
}

export function saveProductForContext(sourceGroup, sourceLetter, product) {
    const baseKey = makeContextKey(sourceGroup, sourceLetter);
    if (!baseKey) return;
    void saveSharedProductSelection(
        getSharedProductFlow(),
        sourceGroup,
        sourceLetter,
        normalizeProductValue(product),
    ).catch((err) => {
        console.warn("Failed to save shared product selection", err);
    });
}

export function loadProductSlotsForContext(sourceGroup, sourceLetter) {
    const baseKey = makeContextKey(sourceGroup, sourceLetter);
    if (!baseKey) return { primary: null, secondary: null };

    const shared = getProductCodesForContext(
        getSharedProductFlow(),
        sourceGroup,
        sourceLetter,
    );
    const normalizedShared = {
        primary: normalizeProductValue(shared.primary),
        secondary: normalizeProductValue(shared.secondary),
    };
    if (normalizedShared.primary || normalizedShared.secondary) {
        return normalizedShared;
    }

    const legacySlots = readLegacyProductSlotsForContextKey(baseKey);
    if (legacySlots && (legacySlots.primary || legacySlots.secondary)) {
        queueLegacySlotsMigration(sourceGroup, sourceLetter, legacySlots);
        return legacySlots;
    }

    const legacySingle = normalizeProductValue(
        readLegacyProductForContextKey(baseKey),
    );
    if (legacySingle) {
        queueLegacySingleMigration(sourceGroup, sourceLetter, legacySingle);
    }
    return { primary: legacySingle, secondary: null };
}

export function saveProductSlotsForContext(sourceGroup, sourceLetter, slots) {
    const baseKey = makeContextKey(sourceGroup, sourceLetter);
    if (!baseKey) return;
    void saveSharedProductSlots(
        getSharedProductFlow(),
        sourceGroup,
        sourceLetter,
        {
            primary: normalizeProductValue(slots && slots.primary),
            secondary: normalizeProductValue(slots && slots.secondary),
        },
    ).catch((err) => {
        console.warn("Failed to save shared product slots", err);
    });
}

export function syncActiveProductStateFromCurrentContext(options = {}) {
    const persistDefault = Boolean(options.persistDefault);
    const group = state.activeGroup;
    const letter = group ? state.source[group] : null;
    if (!group || !letter) return null;

    const defaultCode = getCurrentFlowDefaultProductCode();
    const usesTwoSlots = !state.isCoperion && isTwoSlotProductContext(group);

    if (usesTwoSlots) {
        const savedSlots = loadProductSlotsForContext(group, letter);
        const normalizedSlots = {
            primary: savedSlots.primary || defaultCode,
            secondary: savedSlots.secondary || null,
        };
        state.productSlots = normalizedSlots;
        if (state.activeProductSlot !== "secondary") {
            state.activeProductSlot = "primary";
        }
        const active = getActiveProductFromSlots(
            normalizedSlots,
            state.activeProductSlot,
        );
        state.bigCode = active || "";
        state.selectedProduct = active || null;
        if (
            persistDefault &&
            (normalizedSlots.primary !== savedSlots.primary ||
                normalizedSlots.secondary !== savedSlots.secondary)
        ) {
            saveProductSlotsForContext(group, letter, normalizedSlots);
        }
        return state.bigCode;
    }

    const savedProduct = loadProductForContext(group, letter);
    const product = savedProduct || defaultCode;
    state.productSlots = { primary: product, secondary: null };
    state.activeProductSlot = "primary";
    state.selectedProduct = product || null;
    state.bigCode = product || "";
    if (persistDefault && product && product !== savedProduct) {
        saveProductForContext(group, letter, product);
    }
    return state.bigCode;
}

export function getActiveProductFromSlots(slots, activeSlot) {
    const slot = activeSlot === "secondary" ? "secondary" : "primary";
    const value = slots && slot in slots ? slots[slot] : null;
    return normalizeProductValue(value);
}

