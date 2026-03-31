const BLANK_PRODUCT_LABEL = "BLANK";
const SELECTED_PRODUCTS_MAP_KEY = "selected_products_by_context_v1";
const SELECTED_PRODUCT_SLOTS_MAP_KEY = "selected_product_slots_by_context_v1";
const COPERION_PRODUCT_STORAGE_KEY = "coperion_selected_product_v1";

export function normalizeProductValue(value) {
    const normalized = typeof value === "string" ? value.trim() : "";
    if (!normalized) return null;
    if (normalized.toUpperCase() === BLANK_PRODUCT_LABEL) return null;
    return normalized;
}

export function buildProductSelectionContext(
    sourceGroup,
    sourceLetter,
    isCoperion = false,
) {
    const group = String(sourceGroup || "").trim().toLowerCase();
    const letter = String(sourceLetter || "").trim().toUpperCase();
    if (!group || !letter) return null;
    const flow = isCoperion ? "cop" : "pr";
    return {
        flow,
        sourceGroup: group,
        sourceLetter: letter,
        key: `${flow}:${group}:${letter}`,
    };
}

function normalizeAllowedProducts(allowedProducts) {
    return new Set(
        (allowedProducts || [])
            .map((value) => normalizeProductValue(value))
            .filter(Boolean),
    );
}

function normalizeAllowedProduct(value, allowedProductsSet) {
    const normalized = normalizeProductValue(value);
    if (!normalized) return null;
    if (allowedProductsSet.size && !allowedProductsSet.has(normalized)) return null;
    return normalized;
}

export function normalizeSharedProductSelection(rawSelection, options = {}) {
    const {
        allowedProducts = [],
        defaultProduct = null,
        twoSlot = false,
    } = options;

    const allowed = normalizeAllowedProducts(allowedProducts);
    const primary = normalizeAllowedProduct(
        rawSelection && typeof rawSelection === "object"
            ? rawSelection.primary
            : rawSelection,
        allowed,
    );
    const secondary = twoSlot
        ? normalizeAllowedProduct(
              rawSelection && typeof rawSelection === "object"
                  ? rawSelection.secondary
                  : null,
              allowed,
          )
        : null;
    const defaultPrimary = normalizeAllowedProduct(defaultProduct, allowed);

    return {
        primary: primary || defaultPrimary || null,
        secondary,
    };
}

export function buildSharedProductSelectionPayload(
    context,
    slots,
    options = {},
) {
    const normalized = normalizeSharedProductSelection(slots, options);
    return {
        flow: context.flow,
        sourceGroup: context.sourceGroup,
        sourceLetter: context.sourceLetter,
        primary: normalized.primary,
        secondary: normalized.secondary,
        updatedAt: new Date().toISOString(),
    };
}

function readLocalJsonMap(key) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}

function writeLocalJsonMap(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value || {}));
    } catch {
        // ignore localStorage failures during legacy cleanup
    }
}

function deleteLocalStorageKey(key) {
    try {
        localStorage.removeItem(key);
    } catch {
        // ignore localStorage failures during legacy cleanup
    }
}

function readLegacySingleSelection(context) {
    const productsMap = readLocalJsonMap(SELECTED_PRODUCTS_MAP_KEY);
    const legacyBaseKey = `${context.sourceGroup}:${context.sourceLetter}`;
    const namespacedKey = `${context.flow}:${legacyBaseKey}`;
    return normalizeProductValue(
        productsMap[namespacedKey] || productsMap[legacyBaseKey],
    );
}

function readLegacySlotSelection(context) {
    const slotsMap = readLocalJsonMap(SELECTED_PRODUCT_SLOTS_MAP_KEY);
    const legacyBaseKey = `${context.sourceGroup}:${context.sourceLetter}`;
    const namespacedKey = `${context.flow}:${legacyBaseKey}`;
    const raw = slotsMap[namespacedKey];
    if (!raw || typeof raw !== "object") return null;
    return {
        primary: normalizeProductValue(raw.primary),
        secondary: normalizeProductValue(raw.secondary),
    };
}

export function readLegacyProductSelection(context, options = {}) {
    if (!context) return null;
    const twoSlot = Boolean(options.twoSlot);
    const fromSlotsMap = twoSlot ? readLegacySlotSelection(context) : null;
    const fromSingle = readLegacySingleSelection(context);

    if (context.flow === "cop" && !fromSlotsMap && !fromSingle) {
        try {
            const coperionLegacy = localStorage.getItem(COPERION_PRODUCT_STORAGE_KEY);
            if (coperionLegacy) {
                return normalizeSharedProductSelection(coperionLegacy, options);
            }
        } catch {
            // ignore read failures; Firebase becomes the source of truth
        }
    }

    if (fromSlotsMap || fromSingle) {
        return normalizeSharedProductSelection(
            fromSlotsMap || { primary: fromSingle, secondary: null },
            options,
        );
    }
    return null;
}

export function clearLegacyProductSelection(context) {
    if (!context) return;
    const legacyBaseKey = `${context.sourceGroup}:${context.sourceLetter}`;
    const namespacedKey = `${context.flow}:${legacyBaseKey}`;

    const productsMap = readLocalJsonMap(SELECTED_PRODUCTS_MAP_KEY);
    delete productsMap[namespacedKey];
    delete productsMap[legacyBaseKey];
    writeLocalJsonMap(SELECTED_PRODUCTS_MAP_KEY, productsMap);

    const slotsMap = readLocalJsonMap(SELECTED_PRODUCT_SLOTS_MAP_KEY);
    delete slotsMap[namespacedKey];
    writeLocalJsonMap(SELECTED_PRODUCT_SLOTS_MAP_KEY, slotsMap);

    if (context.flow === "cop") {
        deleteLocalStorageKey(COPERION_PRODUCT_STORAGE_KEY);
    }
}
