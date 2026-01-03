// Central state and shared screen helpers
import { generateBigCode } from './utils/generators.js';

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
    unitNumber: 'AC1001001',
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
    Object.values(screens).forEach((s) => s && s.classList.remove('active'));
    const el = screens[name];
    if (el) el.classList.add('active');
}

// Centralized per-context product persistence
// Stored as a single localStorage JSON object: { "dryer:A": "BS640T", "compound:B": "PA6-205", ... }
const SELECTED_PRODUCTS_MAP_KEY = 'selected_products_by_context_v1';
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

function writeSelectedProductsMap(map) {
    try {
        localStorage.setItem(SELECTED_PRODUCTS_MAP_KEY, JSON.stringify(map || {}));
    } catch {
        // ignore persistence errors
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

function writeSelectedProductSlotsMap(map) {
    try {
        localStorage.setItem(
            SELECTED_PRODUCT_SLOTS_MAP_KEY,
            JSON.stringify(map || {})
        );
    } catch {
        // ignore persistence errors
    }
}

function makeContextKey(sourceGroup, sourceLetter) {
    const group = String(sourceGroup || '').toLowerCase();
    const letter = String(sourceLetter || '').toUpperCase();
    if (!group || !letter) return null;
    return `${group}:${letter}`;
}

function getFlowPrefix() {
    return state.isCoperion ? 'cop' : 'pr';
}

function makeNamespacedKey(baseKey) {
    if (!baseKey) return null;
    const prefix = getFlowPrefix();
    return `${prefix}:${baseKey}`;
}

export function loadProductForContext(sourceGroup, sourceLetter) {
    const baseKey = makeContextKey(sourceGroup, sourceLetter);
    if (!baseKey) return null;
    const map = readSelectedProductsMap();
    // Prefer namespaced (flow-specific) key first
    const namespacedKey = makeNamespacedKey(baseKey);
    const preferred = namespacedKey ? map[namespacedKey] : undefined;
    if (typeof preferred === 'string' && preferred) return preferred;
    // Fallback to legacy unprefixed key for backward compatibility
    const legacy = map[baseKey];
    return typeof legacy === 'string' && legacy ? legacy : null;
}

export function saveProductForContext(sourceGroup, sourceLetter, product) {
    const baseKey = makeContextKey(sourceGroup, sourceLetter);
    if (!baseKey) return;
    const map = readSelectedProductsMap();
    const namespacedKey = makeNamespacedKey(baseKey);
    if (product) {
        if (namespacedKey) map[namespacedKey] = String(product);
    } else {
        if (namespacedKey) delete map[namespacedKey];
    }
    writeSelectedProductsMap(map);
}

export function loadProductSlotsForContext(sourceGroup, sourceLetter) {
    const baseKey = makeContextKey(sourceGroup, sourceLetter);
    if (!baseKey) return { primary: null, secondary: null };
    const map = readSelectedProductSlotsMap();
    const namespacedKey = makeNamespacedKey(baseKey);
    const raw = namespacedKey ? map[namespacedKey] : undefined;
    const fromSlotsMap =
        raw && typeof raw === "object"
            ? {
                  primary: normalizeProductValue(raw.primary),
                  secondary: normalizeProductValue(raw.secondary),
              }
            : null;
    if (fromSlotsMap) return fromSlotsMap;

    // Backward compatibility: if we only have a single persisted product, treat it as primary.
    const legacySingle = loadProductForContext(sourceGroup, sourceLetter);
    return { primary: normalizeProductValue(legacySingle), secondary: null };
}

export function saveProductSlotsForContext(sourceGroup, sourceLetter, slots) {
    const baseKey = makeContextKey(sourceGroup, sourceLetter);
    if (!baseKey) return;
    const map = readSelectedProductSlotsMap();
    const namespacedKey = makeNamespacedKey(baseKey);
    if (!namespacedKey) return;
    const primary = normalizeProductValue(slots && slots.primary);
    const secondary = normalizeProductValue(slots && slots.secondary);
    if (!primary && !secondary) {
        delete map[namespacedKey];
    } else {
        map[namespacedKey] = { primary, secondary };
    }
    writeSelectedProductSlotsMap(map);
}

export function getActiveProductFromSlots(slots, activeSlot) {
    const slot = activeSlot === "secondary" ? "secondary" : "primary";
    const value = slots && slot in slots ? slots[slot] : null;
    return normalizeProductValue(value);
}

