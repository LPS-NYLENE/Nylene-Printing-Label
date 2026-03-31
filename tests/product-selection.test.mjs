import test from "node:test";
import assert from "node:assert/strict";

import {
    buildProductSelectionContext,
    buildSharedProductSelectionPayload,
    clearLegacyProductSelection,
    normalizeSharedProductSelection,
    readLegacyProductSelection,
} from "../modules/utils/product-selection.js";

const allowedProducts = ["CSDN-INT", "INT-190", "BX3WQ662"];

function createLocalStorageMock(initial = {}) {
    const store = new Map(Object.entries(initial));
    return {
        getItem(key) {
            return store.has(key) ? store.get(key) : null;
        },
        setItem(key, value) {
            store.set(key, String(value));
        },
        removeItem(key) {
            store.delete(key);
        },
        dump() {
            return Object.fromEntries(store.entries());
        },
    };
}

test("normalizeSharedProductSelection keeps allowed two-slot selections", () => {
    const selection = normalizeSharedProductSelection(
        { primary: "INT-190", secondary: "CSDN-INT" },
        {
            allowedProducts,
            defaultProduct: "CSDN-INT",
            twoSlot: true,
        },
    );

    assert.deepEqual(selection, {
        primary: "INT-190",
        secondary: "CSDN-INT",
    });
});

test("normalizeSharedProductSelection falls back to default and strips invalid products", () => {
    const selection = normalizeSharedProductSelection(
        { primary: "NOT-VALID", secondary: "BLANK" },
        {
            allowedProducts,
            defaultProduct: "CSDN-INT",
            twoSlot: true,
        },
    );

    assert.deepEqual(selection, {
        primary: "CSDN-INT",
        secondary: null,
    });
});

test("readLegacyProductSelection migrates slot-based local selections", () => {
    const originalLocalStorage = globalThis.localStorage;
    globalThis.localStorage = createLocalStorageMock({
        selected_product_slots_by_context_v1: JSON.stringify({
            "pr:dryer:A": { primary: "INT-190", secondary: "BLANK" },
        }),
    });

    try {
        const context = buildProductSelectionContext("dryer", "A", false);
        const selection = readLegacyProductSelection(context, {
            allowedProducts,
            defaultProduct: "CSDN-INT",
            twoSlot: true,
        });

        assert.deepEqual(selection, {
            primary: "INT-190",
            secondary: null,
        });
    } finally {
        globalThis.localStorage = originalLocalStorage;
    }
});

test("readLegacyProductSelection migrates legacy coperion single-key values", () => {
    const originalLocalStorage = globalThis.localStorage;
    globalThis.localStorage = createLocalStorageMock({
        coperion_selected_product_v1: "BX3WQ662",
    });

    try {
        const context = buildProductSelectionContext("compound", "A", true);
        const selection = readLegacyProductSelection(context, {
            allowedProducts,
            defaultProduct: "BX3WQ662",
            twoSlot: false,
        });

        assert.deepEqual(selection, {
            primary: "BX3WQ662",
            secondary: null,
        });
    } finally {
        globalThis.localStorage = originalLocalStorage;
    }
});

test("clearLegacyProductSelection removes namespaced legacy keys", () => {
    const originalLocalStorage = globalThis.localStorage;
    const mockStorage = createLocalStorageMock({
        selected_products_by_context_v1: JSON.stringify({
            "pr:dryer:A": "INT-190",
            "dryer:A": "INT-190",
        }),
        selected_product_slots_by_context_v1: JSON.stringify({
            "pr:dryer:A": { primary: "INT-190", secondary: null },
        }),
    });
    globalThis.localStorage = mockStorage;

    try {
        const context = buildProductSelectionContext("dryer", "A", false);
        clearLegacyProductSelection(context);

        assert.deepEqual(
            JSON.parse(mockStorage.getItem("selected_products_by_context_v1")),
            {},
        );
        assert.deepEqual(
            JSON.parse(mockStorage.getItem("selected_product_slots_by_context_v1")),
            {},
        );
    } finally {
        globalThis.localStorage = originalLocalStorage;
    }
});

test("buildSharedProductSelectionPayload includes normalized selection metadata", () => {
    const context = buildProductSelectionContext("dryer", "A", false);
    const payload = buildSharedProductSelectionPayload(
        context,
        { primary: " INT-190 ", secondary: "BLANK" },
        {
            allowedProducts,
            defaultProduct: "CSDN-INT",
            twoSlot: true,
        },
    );

    assert.equal(payload.flow, "pr");
    assert.equal(payload.sourceGroup, "dryer");
    assert.equal(payload.sourceLetter, "A");
    assert.equal(payload.primary, "INT-190");
    assert.equal(payload.secondary, null);
    assert.match(payload.updatedAt, /^\d{4}-\d{2}-\d{2}T/);
});
