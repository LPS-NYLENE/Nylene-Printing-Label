import {
    get,
    getDatabase,
    onValue,
    ref,
    set,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { getAppInstance } from "./firebase-db.js";
import { DEFAULT_PRODUCT_CATALOG } from "./catalog/product-choices.js";

const PRODUCT_ROOT_PATH = "sharedProducts";
const PRODUCT_CATALOG_PATH = `${PRODUCT_ROOT_PATH}/catalog`;
const PRODUCT_SELECTIONS_PATH = `${PRODUCT_ROOT_PATH}/selections`;
const PRODUCT_FLOW_KEYS = ["pr", "coperion"];

const DEFAULT_CATALOG_PAYLOAD = buildDefaultCatalogPayload();

let catalogCache = normalizeCatalogSnapshot(DEFAULT_CATALOG_PAYLOAD);
let selectionCache = { pr: {}, coperion: {} };
let syncStarted = false;
let startupPromise = null;
let catalogReady = false;
let selectionReady = false;
let readyResolved = false;
let readyResolver = null;

const readyPromise = new Promise((resolve) => {
    readyResolver = resolve;
});

export function startProductSync() {
    if (startupPromise) return startupPromise;
    startupPromise = (async () => {
        try {
            const db = getDatabase(getAppInstance());
            await ensureCatalogSeeded(db);
            attachCatalogListener(db);
            attachSelectionListener(db);
        } catch (err) {
            console.warn("Failed to start shared product sync", err);
            catalogReady = true;
            selectionReady = true;
            emitSyncEvents();
            resolveReady();
        }
        return readyPromise;
    })();
    return startupPromise;
}

export function waitForProductSyncReady() {
    return readyPromise;
}

export function getProductFlowCatalog(flow) {
    const key = normalizeFlow(flow);
    return catalogCache[key];
}

export function getSelectableProductRecords(flow, options = {}) {
    const includeInactive = Boolean(options.includeInactive);
    const catalog = getProductFlowCatalog(flow);
    if (!catalog) return [];
    return catalog.products.filter(
        (record) => includeInactive || record.active !== false,
    );
}

export function getDefaultProductRecord(flow) {
    const catalog = getProductFlowCatalog(flow);
    if (!catalog) return null;
    return (
        catalog.byId.get(catalog.defaultProductId) ||
        catalog.products.find((record) => record.active !== false) ||
        catalog.products[0] ||
        null
    );
}

export function getProductRecord(flow, selectionKeyOrCode) {
    const key = String(selectionKeyOrCode || "").trim();
    if (!key) return null;
    const catalog = getProductFlowCatalog(flow);
    if (!catalog) return null;
    return (
        catalog.byId.get(key) ||
        catalog.byCode.get(key) ||
        catalog.byAlias.get(key) ||
        null
    );
}

export function getProductCode(flow, selectionKeyOrCode) {
    const record = getProductRecord(flow, selectionKeyOrCode);
    if (record && record.code) return record.code;
    const value = String(selectionKeyOrCode || "").trim();
    return value || null;
}

export function getProductName(flow, selectionKeyOrCode) {
    const record = getProductRecord(flow, selectionKeyOrCode);
    return record ? record.name : "";
}

export function getProductDescription(flow, selectionKeyOrCode) {
    const record = getProductRecord(flow, selectionKeyOrCode);
    return record ? record.description : "";
}

export function getProductSelectionKeysForContext(flow, sourceGroup, sourceLetter) {
    const flowKey = normalizeFlow(flow);
    const groupKey = normalizeGroup(sourceGroup);
    const letterKey = normalizeLetter(sourceLetter);
    if (!groupKey || !letterKey) return { primary: null, secondary: null };
    const raw =
        selectionCache[flowKey] &&
        selectionCache[flowKey][groupKey] &&
        selectionCache[flowKey][groupKey][letterKey];
    if (!raw || typeof raw !== "object") return { primary: null, secondary: null };
    return {
        primary: normalizeSelectionValue(flowKey, raw.primary),
        secondary: normalizeSelectionValue(flowKey, raw.secondary),
    };
}

export function getProductCodesForContext(flow, sourceGroup, sourceLetter) {
    const keys = getProductSelectionKeysForContext(flow, sourceGroup, sourceLetter);
    return {
        primary: getProductCode(flow, keys.primary),
        secondary: getProductCode(flow, keys.secondary),
    };
}

export async function saveSharedProductSelection(
    flow,
    sourceGroup,
    sourceLetter,
    productSelection,
) {
    return saveSharedProductSlots(flow, sourceGroup, sourceLetter, {
        primary: productSelection,
        secondary: null,
    });
}

export async function saveSharedProductSlots(
    flow,
    sourceGroup,
    sourceLetter,
    slots,
) {
    const flowKey = normalizeFlow(flow);
    const groupKey = normalizeGroup(sourceGroup);
    const letterKey = normalizeLetter(sourceLetter);
    if (!groupKey || !letterKey) return;
    await startProductSync();
    const db = getDatabase(getAppInstance());
    const path = `${PRODUCT_SELECTIONS_PATH}/${flowKey}/${groupKey}/${letterKey}`;
    const primary = normalizeSelectionValue(flowKey, slots && slots.primary);
    const secondary = normalizeSelectionValue(flowKey, slots && slots.secondary);
    if (!primary && !secondary) {
        await set(ref(db, path), null);
        return;
    }
    await set(ref(db, path), {
        primary: primary || null,
        secondary: secondary || null,
    });
}

export async function updateProductRecord(flow, selectionKeyOrCode, updates = {}) {
    const flowKey = normalizeFlow(flow);
    const existing = getProductRecord(flowKey, selectionKeyOrCode);
    if (!existing) throw new Error("Product record not found");
    await startProductSync();
    const db = getDatabase(getAppInstance());
    const code = normalizeCode(updates.code ?? existing.code);
    const name = normalizeName(updates.name ?? existing.name, code);
    const description = normalizeDescription(
        updates.description ?? existing.description,
    );
    if (!code) throw new Error("Product code is required");
    const catalog = getProductFlowCatalog(flowKey);
    const conflicting = catalog?.byCode?.get(code);
    if (conflicting && conflicting.id !== existing.id) {
        throw new Error("Another product already uses that code");
    }

    const aliases = new Set(Array.isArray(existing.aliases) ? existing.aliases : []);
    if (existing.code && existing.code !== code) aliases.add(existing.code);

    const payload = {
        ...existing,
        code,
        name,
        description,
        aliases: Array.from(aliases).filter(Boolean),
        active:
            updates.active === undefined
                ? existing.active !== false
                : Boolean(updates.active),
    };

    await set(
        ref(
            db,
            `${PRODUCT_CATALOG_PATH}/flows/${flowKey}/products/${existing.id}`,
        ),
        payload,
    );
}

export function getProductDisplayLabel(flow, selectionKeyOrCode) {
    const record = getProductRecord(flow, selectionKeyOrCode);
    if (!record) return String(selectionKeyOrCode || "").trim();
    if (record.name && record.name !== record.code) {
        return `${record.code} - ${record.name}`;
    }
    return record.code;
}

function attachCatalogListener(db) {
    onValue(
        ref(db, PRODUCT_CATALOG_PATH),
        (snapshot) => {
            const nextCatalog = snapshot.exists()
                ? snapshot.val()
                : DEFAULT_CATALOG_PAYLOAD;
            catalogCache = normalizeCatalogSnapshot(nextCatalog);
            selectionCache = normalizeSelectionSnapshot(selectionCache);
            catalogReady = true;
            emitSyncEvents();
            resolveReady();
        },
        (err) => {
            console.warn("Realtime product catalog subscription failed", err);
            catalogReady = true;
            emitSyncEvents();
            resolveReady();
        },
    );
}

function attachSelectionListener(db) {
    onValue(
        ref(db, PRODUCT_SELECTIONS_PATH),
        (snapshot) => {
            selectionCache = normalizeSelectionSnapshot(snapshot.val());
            selectionReady = true;
            emitSelectionEvent();
            resolveReady();
        },
        (err) => {
            console.warn("Realtime product selection subscription failed", err);
            selectionReady = true;
            emitSelectionEvent();
            resolveReady();
        },
    );
}

async function ensureCatalogSeeded(db) {
    const catalogRef = ref(db, PRODUCT_CATALOG_PATH);
    const snapshot = await get(catalogRef);
    if (!snapshot.exists()) {
        await set(catalogRef, DEFAULT_CATALOG_PAYLOAD);
        return;
    }
    const normalized = normalizeCatalogSnapshot(snapshot.val());
    if (!hasAtLeastOneProduct(normalized)) {
        await set(catalogRef, DEFAULT_CATALOG_PAYLOAD);
    }
}

function resolveReady() {
    if (readyResolved || !catalogReady || !selectionReady) return;
    readyResolved = true;
    readyResolver({
        catalog: catalogCache,
        selections: selectionCache,
    });
}

function emitSyncEvents() {
    emitCatalogEvent();
    emitSelectionEvent();
}

function emitCatalogEvent() {
    if (typeof document === "undefined") return;
    document.dispatchEvent(
        new CustomEvent("productCatalogSync", {
            detail: { catalog: catalogCache },
        }),
    );
}

function emitSelectionEvent() {
    if (typeof document === "undefined") return;
    document.dispatchEvent(
        new CustomEvent("productSelectionSync", {
            detail: { selections: selectionCache },
        }),
    );
}

function buildDefaultCatalogPayload() {
    return {
        version: 1,
        flows: {
            pr: buildDefaultFlowPayload("pr", DEFAULT_PRODUCT_CATALOG.pr),
            coperion: buildDefaultFlowPayload(
                "coperion",
                DEFAULT_PRODUCT_CATALOG.coperion,
            ),
        },
    };
}

function buildDefaultFlowPayload(flow, source) {
    const products = {};
    let defaultProductId = null;
    (source.products || []).forEach((code, index) => {
        const productId = buildProductId(flow, code);
        if (!defaultProductId && code === source.defaultProductCode) {
            defaultProductId = productId;
        }
        products[productId] = {
            id: productId,
            code,
            name: code,
            description: "",
            aliases: [],
            active: true,
            order: index,
            productLine: flow === "coperion" ? "Coperion" : "P&R",
        };
    });
    return {
        defaultProductId,
        products,
    };
}

function normalizeCatalogSnapshot(rawCatalog) {
    const source =
        rawCatalog && typeof rawCatalog === "object"
            ? rawCatalog.flows || rawCatalog
            : {};
    const out = {};
    PRODUCT_FLOW_KEYS.forEach((flow) => {
        out[flow] = normalizeFlowCatalog(flow, source[flow]);
    });
    return out;
}

function normalizeFlowCatalog(flow, rawFlow) {
    const fallbackFlow = DEFAULT_CATALOG_PAYLOAD.flows[flow];
    const rawProducts =
        rawFlow && rawFlow.products && typeof rawFlow.products === "object"
            ? rawFlow.products
            : fallbackFlow.products;
    const products = Object.entries(rawProducts || {})
        .map(([productId, value], index) =>
            normalizeProductRecord(flow, productId, value, index),
        )
        .filter(Boolean)
        .sort((a, b) => {
            if (a.order !== b.order) return a.order - b.order;
            return a.code.localeCompare(b.code);
        });

    const byId = new Map();
    const byCode = new Map();
    const byAlias = new Map();
    products.forEach((record) => {
        byId.set(record.id, record);
        byCode.set(record.code, record);
        record.aliases.forEach((alias) => {
            if (alias && !byAlias.has(alias)) byAlias.set(alias, record);
        });
    });

    const defaultProductId =
        rawFlow && byId.has(rawFlow.defaultProductId)
            ? rawFlow.defaultProductId
            : fallbackFlow.defaultProductId;

    return {
        defaultProductId:
            byId.has(defaultProductId) && defaultProductId
                ? defaultProductId
                : products[0]?.id || null,
        products,
        byId,
        byCode,
        byAlias,
    };
}

function normalizeProductRecord(flow, productId, value, index) {
    if (typeof value === "string") {
        const code = normalizeCode(value);
        if (!code) return null;
        return {
            id: productId,
            code,
            name: code,
            description: "",
            aliases: [],
            active: true,
            order: index,
            productLine: flow === "coperion" ? "Coperion" : "P&R",
        };
    }

    if (!value || typeof value !== "object") return null;
    const code = normalizeCode(value.code);
    if (!code) return null;
    const aliases = Array.isArray(value.aliases)
        ? value.aliases.map((alias) => String(alias || "").trim()).filter(Boolean)
        : [];
    return {
        id: String(value.id || productId || buildProductId(flow, code)).trim(),
        code,
        name: normalizeName(value.name, code),
        description: normalizeDescription(value.description),
        aliases: Array.from(new Set(aliases)),
        active: value.active !== false,
        order: Number.isFinite(Number(value.order)) ? Number(value.order) : index,
        productLine:
            String(value.productLine || "").trim() ||
            (flow === "coperion" ? "Coperion" : "P&R"),
    };
}

function normalizeSelectionSnapshot(rawSelections) {
    const source =
        rawSelections && typeof rawSelections === "object" ? rawSelections : {};
    const out = { pr: {}, coperion: {} };
    PRODUCT_FLOW_KEYS.forEach((flow) => {
        const flowSelections =
            source[flow] && typeof source[flow] === "object" ? source[flow] : {};
        Object.entries(flowSelections).forEach(([group, letters]) => {
            const normalizedGroup = normalizeGroup(group);
            if (!normalizedGroup || !letters || typeof letters !== "object") return;
            if (!out[flow][normalizedGroup]) out[flow][normalizedGroup] = {};
            Object.entries(letters).forEach(([letter, selection]) => {
                const normalizedLetter = normalizeLetter(letter);
                if (!normalizedLetter) return;
                const primary = normalizeSelectionValue(
                    flow,
                    selection && typeof selection === "object"
                        ? selection.primary
                        : selection,
                );
                const secondary = normalizeSelectionValue(
                    flow,
                    selection && typeof selection === "object"
                        ? selection.secondary
                        : null,
                );
                if (!primary && !secondary) return;
                out[flow][normalizedGroup][normalizedLetter] = {
                    primary,
                    secondary,
                };
            });
        });
    });
    return out;
}

function normalizeSelectionValue(flow, value) {
    const raw = String(value || "").trim();
    if (!raw) return null;
    const catalog = getProductFlowCatalog(flow);
    if (!catalog) return raw;
    const record =
        catalog.byId.get(raw) ||
        catalog.byCode.get(raw) ||
        catalog.byAlias.get(raw) ||
        null;
    return record ? record.id : raw;
}

function normalizeFlow(flow) {
    return String(flow || "").trim().toLowerCase() === "coperion"
        ? "coperion"
        : "pr";
}

function normalizeGroup(group) {
    const value = String(group || "").trim().toLowerCase();
    return value || null;
}

function normalizeLetter(letter) {
    const value = String(letter || "").trim().toUpperCase();
    return value || null;
}

function normalizeCode(code) {
    return String(code || "").trim();
}

function normalizeName(name, fallbackCode) {
    const value = String(name || "").trim();
    return value || String(fallbackCode || "").trim();
}

function normalizeDescription(description) {
    return String(description || "").trim();
}

function buildProductId(flow, code) {
    const base = String(code || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    return `${flow}-${base || "product"}`;
}

function hasAtLeastOneProduct(catalog) {
    return PRODUCT_FLOW_KEYS.some(
        (flow) => Array.isArray(catalog[flow]?.products) && catalog[flow].products.length,
    );
}
